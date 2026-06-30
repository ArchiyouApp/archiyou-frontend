/**
 * API Server for Archiyou Script Library
 * Provides REST endpoints to access and execute scripts
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import semver from 'semver'; // for version validation

import { Library } from './Library';

import type {  ScriptExecuteRequest, LoginRequest, ApiAuthResponse, 
                GetResponse, ApiExecutionResponse } from './types';

import { isApiExecutionFileResponse } from './types'

import { ExecutionManager } from './ExecutionManager';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '@archiyou/core/src/runner/types';

//// MAIN SERVER CLASS ////

export class ApiServer 
{
    //// SETTINGS ////
    PORT = 4000; // Default port for the API server
    DEBUG_LOGGER = false; // Enable debug logging for development

    //// END SETTINGS ////

    private fastify: FastifyInstance;
    private library: Library;
    private executionManager: ExecutionManager;
    private port: number;

    constructor(port?:number) 
    {
        this.port = port || this.PORT;
        console.log('🔧 Creating ApiServer with port:', port);
        this.library = new Library();
        console.log('✅ Library initialized');
        
        console.log('🔧 Initializing Fastify...');
        this.fastify = Fastify({
            logger: this.DEBUG_LOGGER
        });

        console.log('🔧 Setting up authentication...');
        this.setupAuthentication();
        console.log('🔧 Setting up routes...');
        this.setupRoutes();
        this.setupErrorHandling();
        
        console.log('✅ ApiServer constructor completed. Use start() to run...');
    }


    //// MAIN CONTROL ////

    async start(): Promise<void> 
    {
        console.log('🔧 ApiServer::start(): Initializing Execution Manager...');
        this.executionManager = await new ExecutionManager().init();

        try 
        {
            await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
            console.log(`🚀 API Server running on http://localhost:${this.port}`);
        } 
        catch (error) 
        {
            this.fastify.log.error(error);
            process.exit(1);
        }
    }

    async stop(): Promise<void> 
    {
        await this.fastify.close();
    }


    //// ROUTES ////

    /** Setup API routes */
    public setupRoutes(): void 
    {
        this.setupApiBasics();
        this.setupAuthRoutes();
        this.setupAdminRoutes();
        this.setupGetRoutes(); // Getting scripts without execution
        this.setupExecuteRoutes(); // Execution of scripts
        
        // TODO: POST EXECUTION ROUTES
    }

    private setupApiBasics(): void
    {   
        this.fastify.register(import('@fastify/cors'), { origin: true }); // Register CORS

        // Health check endpoint
        this.fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => 
        {
            return { status: 'healthy', timestamp: new Date().toISOString() };
        });
    }

    private setupAuthRoutes(): void
    {
        // Login endpoint
        this.fastify.post<LoginRequest>('/auth/login', async (request, reply): Promise<ApiAuthResponse> => 
        {
            try 
            {
                const { username, password } = request?.body || {};

                if (!request || !username || !password) 
                {
                    reply.code(400);
                    return {
                        success: false,
                        error: 'Username and password are required'
                    };
                }

                // verify admin credentials
                if (!await this.verifyAdmin(username, password)) 
                {
                    reply.code(401);
                    return {
                        success: false,
                        error: 'Invalid credentials'
                    };
                }
                // Generate JWT token
                const token = this.fastify.jwt.sign({ username, role: 'admin' }, { expiresIn: '24h' });

                return {
                    success: true,
                    token
                };
            } 
            catch (error) 
            {
                reply.code(500);
                return {
                    success: false,
                    error: 'Internal server error'
                };
            }
        });

        // Token verification endpoint
        this.fastify.get('/auth/verify', {
            preHandler: this.authenticateToken.bind(this)
        }, async (request: FastifyRequest, reply: FastifyReply) => 
        {
            return {
                success: true,
                user: (request as any).user
            };
        });
    }

    //// GET SCRIPTS ////
    
    /** Setup Get routes which all return data without execution of scripts 
     *  To get all scripts we use the /scripts route
     *  We use both /scripts/:author/:scriptAndVersion and /:author/:scriptAndVersion
     *  In that way its consistent to post the POST endpoints as the GET ones
    */
    setupGetRoutes(): void
    {
        // Main info
        this.fastify.get('/', async (request: FastifyRequest, reply: FastifyReply): Promise<GetResponse> => 
        {
            return {
                success: true,
                data: {
                    name: 'Archiyou Publish API',
                    version: '2.0.0', // new ts version >= 2
                    maintainer: 'Archiyou',
                    email: 'info@archiyou.com'
                }
            };
        });

        // Get all scripts
        this.fastify.get('/scripts', 
                async (request: FastifyRequest, reply: FastifyReply): Promise<GetResponse> => 
        {
            try 
            {
                const scripts = await this.library.getAllScripts();
                return {
                    success: true,
                    data: scripts.map(script => script.toData())
                };
            } 
            catch (error: any) 
            {
                return this.returnGetError(reply, 500, `Failed to load scripts: ${error.message}`);
            }
        });

        // List scripts by author
        const getScriptByAuthor = async (request: FastifyRequest<{ Params: { author: string } }>, reply: FastifyReply): Promise<GetResponse> => 
        {
            try 
            {
                const { author } = request.params;
                const scripts = await this.library.getScriptsByAuthor(author);

                return {
                    success: true,
                    data: scripts.map(script => script.toData())
                };
            } 
            catch (error: any) 
            {
                return this.returnGetError(reply, 500, `Failed to load scripts for author ${request.params.author}: ${error.message}`);
            }
        };

        // We want both /scripts extention and direct :author
        this.fastify.get('/scripts/:author', getScriptByAuthor);
        this.fastify.get('/:author', getScriptByAuthor);

        // Get versions of a script - NOTE: needs to before script/version route
        this.fastify.get('/scripts/:author/:scriptName/versions', 
                async (request: FastifyRequest<{ Params: { author: string, scriptName: string } }>, reply: FastifyReply): Promise<GetResponse> => 
        {
            try 
            {
                const { author, scriptName } = request.params;
                const scriptVersions = (await this.library.getScriptVersions(author, scriptName)).map(s => s.published.version);

                return {
                    success: true,
                    data: scriptVersions
                };
            } 
            catch (error: any) 
            {
                return this.returnGetError(reply, 500, `Failed to get versions for script "${request.params.author}/${request.params.scriptName}": ${error.message}`);
            }
        });

        // Get script data without execution
        const getScriptByAuthorAndVersion = async (request: FastifyRequest<{ Params: { author: string, scriptAndVersion: string } }>, reply: FastifyReply): Promise<GetResponse> => 
        {
            try 
            {
                const { author, scriptAndVersion } = request.params;
                const { scriptName, version } = this.parseScriptVersionUrl(scriptAndVersion);
                // always make version valid semver (for example "0.5" -> "0.5.0")
                const validVersion = version ? semver.valid(semver.coerce(version)) : undefined;

                const script = (validVersion) 
                    ? await this.library.getScript(author, scriptName, validVersion)
                    : await this.library.getLatestScriptVersion(author, scriptName);

                if (!script) 
                {
                    return this.returnGetError(reply, 404, `Script "${author}/${scriptName}:${version ? version : 'latest'}" not found`);
                }
                return {
                    success: true,
                    data: script.toData()
                };
            } 
            catch (error: any) 
            {
                return this.returnGetError(reply, 500, `Failed to get script: ${error.message}`);
            }
        };

        this.fastify.get('/scripts/:author/:scriptAndVersion', getScriptByAuthorAndVersion);
        this.fastify.get('/:author/:scriptAndVersion', getScriptByAuthorAndVersion);

        

    }

    //// EXECUTION ROUTES ////

    /** Execute scripts from the Library and returns results
        
        The path is of the form: /{author}/{scriptName}:{?version} 
        If version is not provided, the latest version is used.

        The request body should be of the form:
        {
            params: { paramName: value, ... }, // parameters for the script
            preset: 'presetName' // optional preset to use
            outputs: ['path/to/output1?formatoption=1', 'path/to/output2'] // default is ['default/model/glb']
        }

    */
    setupExecuteRoutes(): void
    {
        this.fastify.post('/:author/:scriptAndVersion', 
                async (request: FastifyRequest<{ 
                        Params: { author: string; scriptAndVersion: string }
                        Body: { params?: Record<string, any>; preset?: string; outputs?: Array<string>, cache?: boolean, forceFileResponse?: boolean }}>, 
                        reply: FastifyReply): Promise<ApiExecutionResponse> => 
        {
            try 
            {
                const { author, scriptAndVersion } = request.params;
                const { scriptName, version } = this.parseScriptVersionUrl(scriptAndVersion);
                const validVersion = version ? semver.valid(semver.coerce(version)) : undefined;

                const script = (validVersion) 
                    ? await this.library.getScript(author, scriptName, validVersion)
                    : await this.library.getLatestScriptVersion(author, scriptName);

                if (!script) 
                {
                    reply.code(404);
                    return {
                        success: false,
                        error: `Script ${author}/${scriptName}:${version} not found`,
                        data: null
                    };
                }
                // Execute the script with ExecutionManager instance            
                // Basic checks on parameter values
                if(!request.body || typeof request.body !== 'object')
                {
                    reply.code(400);
                    return { success: false, error: `Invalid request body. Expected an object.`, data: null };
                }
                if (typeof request.params === 'object' && Object.keys(request.params || {}).length === 0)
                {
                    reply.code(400);
                    return { success: false, error: `Invalid request parameters. Expected non-empty object.`, data: null };
                }


                // Check parameter values
                const { success, errors, checkedParamValues } = script.checkParamValuesVerbose(request.body?.params || {}); 

                if (!success)
                {
                    reply.code(422);
                    return {
                        success: false,
                        error: `Invalid request parameter values. See data array for details.`,
                        data: errors
                    };
                }
                
                const executionRequest: RunnerScriptExecutionRequest = {
                    kernel: (request.body as any)?.kernel || 'mesh', // initial kernel; can be switched in-script
                    script,
                    params: checkedParamValues,
                    preset: request.body.preset, // TODO: implement
                    outputs: request.body.outputs,
                    cache: request.body?.cache !== false, // default is true
                    forceFileResponse: request.body?.forceFileResponse === true // default is false
                };

                console.info(`**** 🔧 ApiServer::Executing script "${author}/${scriptName}:${version}" with params values "${JSON.stringify(checkedParamValues)}" ****`);

                const response = await this.executionManager.execute(executionRequest);

                if(isApiExecutionFileResponse(response)) // forceFileResponse was set, return binary file or zip
                {
                    if(response.ext === 'json')
                    {
                        reply.type(`text/plain`);
                    } 
                    else {
                        reply.type(`application/${response.ext}`);
                    }
                    reply.header('Content-Disposition', `attachment; filename="${scriptName}.${response.ext}"`);
                    reply.send(response.data);
                }
                else {
                    // normal verbose text response
                    return response;
                }
            } 
            catch (error: any) 
            {
                reply.code(500);
                return { success: false, error: `Server error while executing script: ${error.message}`, data: null };
            }
        });
        
    }
    

    //// ADMIN ////
    /* Admin routes for managing scripts. 
        - admin/publish - Adding scripts to library
        - admin/unpublish - Removing scripts from library
        - TODO: admin/precompute - Precomputing scripts for faster execution
        
    */
    private setupAdminRoutes(): void 
    {
        this.fastify.post('/admin/publish', {
            preHandler: this.authenticateToken.bind(this)
        }, async (request, reply) => 
        {
            // TODO: Implement publish logic
            return {
                success: true,
                message: 'Publish functionality coming soon'
            };
        });

        this.fastify.post('/admin/unpublish', {
            preHandler: this.authenticateToken.bind(this)
        }, async (request, reply) => 
        {
            // TODO: Implement unpublish logic
            return {
                success: true,
                message: 'Unpublish functionality coming soon'
            };
        });
    }


    //// EXECUTION OF SCRIPTS ////



    //// AUTHENTICATION ////

    private async setupAuthentication(): Promise<void>
    {
        if (!process.env.JWT_SECRET)
        {
            throw new Error('JWT_SECRET is not set in environment variables. Please set it in .env file.');
        }

        // Register JWT plugin
        await this.fastify.register(import('@fastify/jwt'), { secret: process.env.JWT_SECRET });
    }

    private async authenticateToken(request: FastifyRequest, reply: FastifyReply): Promise<void>
    {
        try 
        {
            await request.jwtVerify();
        } 
        catch (err) 
        {
            reply.code(401).send({
                success: false,
                error: 'Unauthorized access. Please provide a valid token.'
            });
            throw err; // Important: throw to stop execution
        }
    }

    /** Simple admin verification 
     *  For now, just checks if username is 'admin' and password matches environment variable
     *  See ADMIN_PASSWORD in .env file
     *  TODO: Introduce with multiple users and hashed passwords
    */
    private async verifyAdmin(username: string, password: string): Promise<boolean>
    {
        if (username !== 'admin'){ return false;}
        
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) { console.error('❌ ADMIN_PASSWORD not set in environment variables'); return false;}

        // For now plain text comparison, but you should hash passwords in production
        return password === adminPassword;
    }

    //// UTILS ////

    private setupErrorHandling(): void 
    {
        this.fastify.setErrorHandler(async (error, request, reply) => 
        {
            request.log.error(error);
            reply.code(error.statusCode || 500).send({
                success: false,
                error: error.message || 'Internal server error'
            });
        });

        this.fastify.setNotFoundHandler(async (request, reply) => 
        {
            reply.code(404).send({
                success: false,
                error: `Route ${request.method} ${request.url} not found`
            });
        });
    }

    private returnGetError(reply: FastifyReply, code: number, message:string): GetResponse 
    {
        reply.code(code);
        return {
            success: false,
            error: `${message}`
        };
    }

    private parseScriptVersionUrl(url: string): { scriptName: string; version?: string } | null 
    {
        const match = url.match(/([^/:]+)(?::([^$]+))?/);
        if (!match){
            console.error(`ApiServer::parseScriptVersionUrl(): Invalid URL format: ${url}`);
            return { scriptName: undefined, version: undefined};
        };

        const [, scriptName, version] = match;
        
        // check valid semver here too
        const checkedVersion = semver.valid(version); // will return original if OK, otherwise null
        return {scriptName, version: checkedVersion };
    }

}
   


//// MAIN ////

(async () => 
{
    console.log('🔧 Starting API server...');
    try 
    {
        const apiServer = new ApiServer();
        await apiServer.start();
        console.log('✅ ApiServer started successfully');
    } 
    catch (error) 
    {
        console.error('❌ Failed to start API server:', error);
        process.exit(1);
    }
})();
