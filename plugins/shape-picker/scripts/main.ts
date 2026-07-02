/**
 * shape-picker — main script (script mode)
 *
 * Declares the plugin's input schema via $PARAMS and generates a primitive
 * shape from it. This IS the "menu that runs a script": the SHAPE param is an
 * `options` type, so even the default archiyou param menu renders it as a
 * dropdown today. The custom `ui/param-menu.html` is the plugin's own version
 * of that dropdown, driven over the `archiyou` bridge (needs the plugin loader).
 *
 * The `code` string is the archiyou script language (same shape as the fixtures
 * in packages/core/tests/cadscripts/scripts). `box`/`sphere`/`cylinder` are
 * scope globals (constants.ts › MODELER_METHODS_INTO_GLOBAL); shapes auto-add
 * to the scene, and `$SHAPE`/`$SIZE` are the current param values.
 */
export default {
  name: 'shape-picker',
  author: 'archiyou',
  description: 'Pick a primitive shape (cube / sphere / cylinder) and generate it.',
  code: `
    units('mm');

    // The input schema — the SHAPE dropdown + a size.
    $PARAMS.define('SHAPE', 'options', {
      options: ['cube', 'sphere', 'cylinder'],
      default: 'cube',
      label: 'Shape',
    });
    $PARAMS.define('SIZE', 'number', {
      min: 10, max: 300, step: 10, default: 100,
      label: 'Size', units: 'mm', group: 'Size',
    });

    // Generate the chosen shape.
    if ($SHAPE === 'cube')
    {
      box($SIZE, $SIZE, $SIZE).color('blue');
    }
    else if ($SHAPE === 'sphere')
    {
      sphere($SIZE / 2).color('green');
    }
    else if ($SHAPE === 'cylinder')
    {
      cylinder($SIZE / 2, $SIZE).color('orange');
    }
  `,
  params: {},
};
