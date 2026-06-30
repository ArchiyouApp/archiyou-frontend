import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import path from 'path';

export interface TestContainers {
    redis?: StartedTestContainer;
    worker?: StartedTestContainer;
    api?: StartedTestContainer;
}
let containers: Partial<TestContainers> = {};

// Project root directory
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Start all required Docker containers for integration tests
 */
export async function startContainers(which: Array<'redis' | 'worker' | 'api'> = []): Promise<TestContainers> {
    console.log('🐳 Starting test containers...');

    // Start Redis
    if (which.includes('redis')) {
        containers.redis = await new GenericContainer('redis:7-alpine')
            .withExposedPorts(6379)
            .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
            .withStartupTimeout(30000)
            .start();

        process.env.REDIS_HOST = containers.redis.getHost();
        process.env.REDIS_PORT = String(containers.redis.getMappedPort(6379));

        console.log(`✅ Redis started at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
    }

    // Start Worker from local Dockerfile
    if (which.includes('worker'))
    {
        console.log('🔨 Building worker container from Dockerfile.worker...');
        
        containers.worker = await GenericContainer.fromDockerfile(PROJECT_ROOT, 'Dockerfile.worker')
            .withBuildArgs({
                // Add a unique timestamp to force rebuild
                BUILD_TIMESTAMP: Date.now().toString(),
            })
            .withCache(false) // Disable testcontainers cache
            .build()
            .then(container => 
                container
                    .withEnvironment({
                        NODE_ENV: 'development',
                        REDIS_HOST: containers.redis?.getHost() || 'localhost',
                        REDIS_PORT: String(containers.redis?.getMappedPort(6379) || 6379),
                    })
                    .withStartupTimeout(120000) // 2 minutes for OC loading
                    .start()
            );

        console.log(`✅ Worker started`);
    }

    // Start API from local Dockerfile
    if (which.includes('api'))
    {
        // TODO
    }

    return containers as TestContainers;
}

/**
 * Stop all running test containers
 */
export async function stopContainers(): Promise<void> {
    
    console.log('🧹 Stopping test containers...');

    if (containers.worker)
    {
        await containers.worker.stop();
        console.log('✅ Worker stopped');
    }

    if (containers.api)
    {
        await containers.api.stop();
        console.log('✅ API stopped');
    }

    if (containers.redis) {
        await containers.redis.stop();
        console.log('✅ Redis stopped');
    }

    containers = {};
}

/**
 * Get Redis connection config from running container
 */
export function getRedisConfig(): { host: string; port: number } {
    if (!containers.redis) {
        throw new Error('Redis container not started. Call startContainers([\'redis\']) first.');
    }

    return {
        host: containers.redis.getHost(),
        port: containers.redis.getMappedPort(6379),
    };
}

/**
 * Get API connection config from running container
 */
export function getApiConfig(): { host: string; port: number; url: string } {
    if (!containers.api) {
        throw new Error('API container not started. Call startContainers([\'api\']) first.');
    }

    const host = containers.api.getHost();
    const port = containers.api.getMappedPort(4000);

    return {
        host,
        port,
        url: `http://${host}:${port}`,
    };
}