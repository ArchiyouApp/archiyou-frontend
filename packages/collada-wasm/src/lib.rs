//! collada-wasm
//!
//! WebAssembly COLLADA (.dae) writer for Archiyou, built on a vendored + patched copy of
//! 5mattmatt1/collada_io (see `src/collada_io/mod.rs` for the patch log).
//!
//! The API is a stateful builder rather than the JSON-in/JSON-out shape used by
//! `packages/gdrr2bp-wasm`: geometry buffers as JSON would be enormous, whereas `&[f32]`
//! views onto JS typed arrays cross the boundary nearly for free.
//!
//! It is split the way COLLADA itself is split:
//!   - `library_geometries` is a FLAT pool  -> `add_*_geometry()`
//!   - `library_visual_scenes` is a TREE    -> `begin_node()` / `attach_geometry()` / `end_node()`
//!
//! Welding happens here rather than in meshup. meshup's Rust already has an equivalent
//! (`mesh/mod.rs get_vertices_and_indices`), but it is not exposed to WASM and exposing it
//! would mean rebuilding meshup's wasm binary — which in this repo is ahead of its csgrs
//! submodule pin, so rebuilding regresses rings/silhouette/reconstruct_ngons. Welding a
//! buffer we already have in hand is far cheaper than that risk.

use std::collections::HashMap;

use wasm_bindgen::prelude::*;

pub mod collada_io;

use crate::collada_io::collada::Collada;
use crate::collada_io::geometry::{Accessor, FloatArray, Geometry, Lines, Mesh, Polylist, Source, Triangles, Vertices};
use crate::collada_io::material::{Effect, Material};
use crate::collada_io::meta::{Asset, Contributor, Unit, UpAxis};
use crate::collada_io::scene::{BindMaterial, Instance, InstanceMaterial, Node, Scene, VisualScene};

/// Grid-quantized vertex welder.
///
/// Keys on `(v / tol).round()`, which is what meshup's own Rust welder does. Note the
/// classic caveat: two points closer than `tol` can still fall either side of a cell
/// boundary and stay unwelded. It never merges points it shouldn't, which is the direction
/// that matters — a missed merge costs bytes, a wrong merge corrupts geometry.
struct Welder
{
    map: HashMap<[i64; 3], u32>,
    data: Vec<f32>,
    tolerance: f32,
}

impl Welder
{
    fn new(tolerance: f32) -> Self
    {
        Welder {
            map: HashMap::new(),
            data: Vec::new(),
            tolerance,
        }
    }

    /// Returns the index of this xyz in the deduplicated buffer, appending it if new.
    fn add(&mut self, x: f32, y: f32, z: f32) -> u32
    {
        // tolerance <= 0 disables welding: every vertex gets its own slot
        if self.tolerance <= 0.0
        {
            let index = (self.data.len() / 3) as u32;
            self.data.extend_from_slice(&[x, y, z]);
            return index;
        }

        let inv = 1.0 / self.tolerance;
        let key = [
            (x as f64 * inv as f64).round() as i64,
            (y as f64 * inv as f64).round() as i64,
            (z as f64 * inv as f64).round() as i64,
        ];

        if let Some(index) = self.map.get(&key)
        {
            return *index;
        }

        let index = (self.data.len() / 3) as u32;
        self.data.extend_from_slice(&[x, y, z]);
        self.map.insert(key, index);
        index
    }
}

fn xyz_params() -> Vec<String>
{
    vec!["X".to_string(), "Y".to_string(), "Z".to_string()]
}

/// The material symbol every primitive declares.
///
/// In COLLADA the symbol is scoped to the geometry and only resolved to a real material at
/// instance time, via `<instance_material symbol=… target=…>`. That is what lets one
/// geometry be instanced twice with different materials — and it is why the primitive needs
/// a symbol even though the geometry itself has no idea which material it will get.
const MATERIAL_SYMBOL: &str = "material";

/// Builds one COLLADA document. See the module docs for the two-phase usage.
#[wasm_bindgen]
pub struct ColladaWriter
{
    asset: Asset,
    effects: Vec<Effect>,
    materials: Vec<Material>,
    geometries: Vec<Geometry>,
    /// Finished top-level nodes.
    roots: Vec<Node>,
    /// Open nodes, innermost last. `end_node()` pops into the parent's children.
    stack: Vec<Node>,
}

#[wasm_bindgen]
impl ColladaWriter
{
    /// `unit_name` is the COLLADA unit name (e.g. "millimeter"), `meter` how many metres one
    /// model unit is (mm -> 0.001). `up_axis` is one of "X_UP" / "Y_UP" / "Z_UP" — Archiyou
    /// passes "Z_UP", since meshup is natively Z-up and COLLADA can say so (unlike glTF).
    /// `created_iso` is an ISO-8601 timestamp; the caller supplies it so this crate needs no
    /// clock (and therefore no chrono).
    #[wasm_bindgen(constructor)]
    pub fn new(unit_name: &str, meter: f64, up_axis: &str, created_iso: &str) -> ColladaWriter
    {
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        let up = match up_axis
        {
            "X_UP" => UpAxis::XUp,
            "Y_UP" => UpAxis::YUp,
            _ => UpAxis::ZUp,
        };

        let asset = Asset {
            contributors: vec![Contributor::default()],
            created: created_iso.to_string(),
            keywords: None,
            modified: created_iso.to_string(),
            revision: None,
            subject: None,
            title: None,
            unit: Unit {
                name: unit_name.to_string(),
                meter,
            },
            up_axis: Some(up),
        };

        ColladaWriter {
            asset,
            effects: Vec::new(),
            materials: Vec::new(),
            geometries: Vec::new(),
            roots: Vec::new(),
            stack: Vec::new(),
        }
    }

    //// MATERIALS ////

    /// Register a material. `id` is what `attach_geometry()` references. RGBA is 0..1.
    #[wasm_bindgen(js_name = addMaterial)]
    pub fn add_material(&mut self, id: &str, name: &str, r: f32, g: f32, b: f32, a: f32)
    {
        let effect_id = format!("{}-effect", id);
        self.effects.push(Effect {
            id: effect_id.clone(),
            diffuse: [r, g, b, a],
        });
        self.materials.push(Material {
            id: id.to_string(),
            name: name.to_string(),
            effect_id,
        });
    }

    //// GEOMETRY (flat library_geometries) ////

    /// N-gon faces -> `<polylist>`. `positions`/`normals` are per face-vertex (interleaved
    /// xyz, unwelded, in face order); `vcount[i]` is the vertex count of face i.
    ///
    /// This is the default mesh path: it preserves meshup's n-gon topology, where
    /// `Mesh.toBuffer()` would have flattened it into a triangle soup.
    #[wasm_bindgen(js_name = addPolylistGeometry)]
    pub fn add_polylist_geometry(
        &mut self,
        id: &str,
        name: &str,
        positions: &[f32],
        normals: &[f32],
        vcount: &[u32],
        weld_tolerance: f32,
    )
    {
        let face_vertex_count: u32 = vcount.iter().sum();
        let has_normals = normals.len() >= (face_vertex_count as usize) * 3;

        // Positions and normals weld independently into separate sources with separate
        // <input offset>s — the standard COLLADA layout, and where most of the size win is:
        // a cube collapses from 36 loose vertices to 8 positions and 6 normals.
        let mut pos_welder = Welder::new(weld_tolerance);
        let mut norm_welder = Welder::new(weld_tolerance);
        let mut primitive: Vec<u32> = Vec::with_capacity(face_vertex_count as usize * 2);

        for i in 0..(face_vertex_count as usize)
        {
            let p = i * 3;
            if p + 2 >= positions.len() { break; }
            primitive.push(pos_welder.add(positions[p], positions[p + 1], positions[p + 2]));
            if has_normals
            {
                primitive.push(norm_welder.add(normals[p], normals[p + 1], normals[p + 2]));
            }
        }

        let polylist = Polylist {
            vertices: format!("#{}-vertices", id),
            normals: if has_normals { Some(format!("#{}-normals", id)) } else { None },
            vcount: vcount.to_vec(),
            primitive,
            material: Some(MATERIAL_SYMBOL.to_string()),
        };

        self.push_geometry(id, name, pos_welder, norm_welder, has_normals, Some(polylist), None, None);
    }

    /// Raw indexed triangles -> `<triangles>`. The `ngons: false` fallback path, fed
    /// straight from meshup's `Mesh.toBuffer()`.
    #[wasm_bindgen(js_name = addMeshGeometry)]
    pub fn add_mesh_geometry(
        &mut self,
        id: &str,
        name: &str,
        positions: &[f32],
        normals: &[f32],
        indices: &[u32],
        weld_tolerance: f32,
    )
    {
        let has_normals = normals.len() >= positions.len();

        let mut pos_welder = Welder::new(weld_tolerance);
        let mut norm_welder = Welder::new(weld_tolerance);
        let mut primitive: Vec<usize> = Vec::with_capacity(indices.len() * 2);

        for index in indices
        {
            let p = (*index as usize) * 3;
            if p + 2 >= positions.len() { continue; }
            primitive.push(pos_welder.add(positions[p], positions[p + 1], positions[p + 2]) as usize);
            if has_normals
            {
                primitive.push(norm_welder.add(normals[p], normals[p + 1], normals[p + 2]) as usize);
            }
        }

        let triangles = Triangles {
            vertices: format!("#{}-vertices", id),
            tex_vertices: None,
            normals: if has_normals { Some(format!("#{}-normals", id)) } else { None },
            primitive: Some(primitive),
            material: Some(MATERIAL_SYMBOL.to_string()),
        };

        self.push_geometry(id, name, pos_welder, norm_welder, has_normals, None, Some(triangles), None);
    }

    /// A tessellated polyline -> `<lines>`. `positions` is a flat xyz point run; it is
    /// expanded into (n-1) two-index segments.
    #[wasm_bindgen(js_name = addLinesGeometry)]
    pub fn add_lines_geometry(&mut self, id: &str, name: &str, positions: &[f32])
    {
        let point_count = positions.len() / 3;
        if point_count < 2 { return; }

        // Curves are welded losslessly (tolerance 0) — collapsing near-coincident points on
        // a polyline would silently drop segments.
        let mut pos_welder = Welder::new(0.0);
        let mut indices: Vec<u32> = Vec::with_capacity(point_count);
        for i in 0..point_count
        {
            let p = i * 3;
            indices.push(pos_welder.add(positions[p], positions[p + 1], positions[p + 2]));
        }

        let mut primitive: Vec<u32> = Vec::with_capacity((point_count - 1) * 2);
        for i in 0..(point_count - 1)
        {
            primitive.push(indices[i]);
            primitive.push(indices[i + 1]);
        }

        let lines = Lines {
            vertices: format!("#{}-vertices", id),
            primitive,
            material: Some(MATERIAL_SYMBOL.to_string()),
        };

        let norm_welder = Welder::new(0.0);
        self.push_geometry(id, name, pos_welder, norm_welder, false, None, None, Some(lines));
    }

    //// SCENE TREE (library_visual_scenes) ////

    /// Open a `<node>`. Nodes nest: every `begin_node` must be matched by an `end_node`.
    #[wasm_bindgen(js_name = beginNode)]
    pub fn begin_node(&mut self, id: &str, name: &str)
    {
        self.stack.push(Node {
            id: id.to_string(),
            name: name.to_string(),
            // meshup bakes all transforms into the geometry, so every node is identity and
            // the positions are already world-space.
            transformation_elements: Vec::new(),
            instances: Vec::new(),
            children: Vec::new(),
        });
    }

    /// Attach an `<instance_geometry>` (optionally material-bound) to the open node.
    #[wasm_bindgen(js_name = attachGeometry)]
    pub fn attach_geometry(&mut self, geom_id: &str, material_id: Option<String>)
    {
        let bind_material = material_id.map(|mat| BindMaterial {
            instance_materials: vec![InstanceMaterial {
                symbol: MATERIAL_SYMBOL.to_string(),
                target: format!("#{}", mat),
            }],
        });

        if let Some(node) = self.stack.last_mut()
        {
            node.instances.push(Instance::Geometry {
                url: format!("#{}", geom_id),
                name: None,
                sid: None,
                bind_material,
            });
        }
    }

    /// Close the open `<node>`, appending it to its parent (or to the scene roots).
    #[wasm_bindgen(js_name = endNode)]
    pub fn end_node(&mut self)
    {
        if let Some(node) = self.stack.pop()
        {
            match self.stack.last_mut()
            {
                Some(parent) => parent.children.push(node),
                None => self.roots.push(node),
            }
        }
    }

    //// OUTPUT ////

    /// Serialize the document. Errors on unbalanced `begin_node`/`end_node`.
    ///
    /// The error is a plain `String` rather than a `JsError` so this stays callable from
    /// native `cargo test` — constructing a `JsError` panics off-wasm. `ColladaWriter.ts`
    /// turns it back into a real `Error` on the JS side.
    #[wasm_bindgen(js_name = toStringDae)]
    pub fn to_string_dae(&self) -> std::result::Result<String, String>
    {
        if !self.stack.is_empty()
        {
            return Err(format!(
                "ColladaWriter: {} node(s) left open — every beginNode() needs a matching endNode()",
                self.stack.len()
            ));
        }

        let doc = Collada {
            asset: self.asset.clone(),
            effects: if self.effects.is_empty() { None } else { Some(self.effects.clone()) },
            materials: if self.materials.is_empty() { None } else { Some(self.materials.clone()) },
            geometries: if self.geometries.is_empty() { None } else { Some(self.geometries.clone()) },
            visual_scenes: Some(vec![VisualScene {
                id: "Scene".to_string(),
                name: "Scene".to_string(),
                nodes: self.roots.clone(),
            }]),
            scene: Some(Scene {
                visual_scenes: vec!["#Scene".to_string()],
            }),
        };

        let mut buffer: Vec<u8> = Vec::new();
        doc.write_to(&mut buffer)
            .map_err(|e| format!("ColladaWriter: XML write failed: {}", e))?;

        String::from_utf8(buffer)
            .map_err(|e| format!("ColladaWriter: output was not valid UTF-8: {}", e))
    }
}

// Helpers kept out of the #[wasm_bindgen] impl block: wasm-bindgen only exports methods whose
// signatures it can map to JS, and these take/return vendored Rust types.
impl ColladaWriter
{
    #[allow(clippy::too_many_arguments)]
    fn push_geometry(
        &mut self,
        id: &str,
        name: &str,
        pos_welder: Welder,
        norm_welder: Welder,
        has_normals: bool,
        polylist: Option<Polylist>,
        triangles: Option<Triangles>,
        lines: Option<Lines>,
    )
    {
        let mut sources = vec![Source {
            id: format!("{}-positions", id),
            float_array: FloatArray {
                id: format!("{}-positions-array", id),
                data: pos_welder.data,
            },
            accessor: Accessor { params: xyz_params() },
        }];

        if has_normals
        {
            sources.push(Source {
                id: format!("{}-normals", id),
                float_array: FloatArray {
                    id: format!("{}-normals-array", id),
                    data: norm_welder.data,
                },
                accessor: Accessor { params: xyz_params() },
            });
        }

        self.geometries.push(Geometry {
            id: Some(id.to_string()),
            name: Some(name.to_string()),
            mesh: Mesh {
                sources,
                vertices: Vertices {
                    id: format!("{}-vertices", id),
                    name: None,
                    source: format!("#{}-positions", id),
                },
                triangles,
                polylist,
                lines,
            },
        });
    }
}
