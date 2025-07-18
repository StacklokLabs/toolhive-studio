import { it, expect, vi } from 'vitest'
import type { FormSchemaRunMcpCommand } from '../form-schema-run-mcp-server-with-command'
import type { QueryClient } from '@tanstack/react-query'
import { orchestrateRunCustomServer } from '../orchestrate-run-custom-server'
import { getApiV1BetaWorkloadsQueryKey } from '@/common/api/generated/@tanstack/react-query.gen'
import { toast } from 'sonner'
import { server } from '@/common/mocks/node'
import { http, HttpResponse } from 'msw'
import { mswEndpoint } from '@/common/mocks/msw-endpoint'
import * as Sentry from '@sentry/electron/renderer'

vi.mock('@sentry/electron/renderer', () => ({
  startSpan: vi.fn(),
}))

vi.mock('../restart-client-notification', () => ({
  restartClientNotification: vi.fn(),
}))

const mockStartSpan = vi.mocked(Sentry.startSpan)

vi.mock('sonner', async () => {
  const original = await vi.importActual<typeof import('sonner')>('sonner')
  return {
    ...original,
    toast: {
      loading: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      dismiss: vi.fn(),
    },
  }
})

/**
 * Creates reusable mocks for testing the orchestrateRunCustomServer function
 */
function createTestMocks(options?: {
  saveSecretImplementation?: () => Promise<{ key: string }>
  getIsServerReadyImplementation?: () => Promise<boolean>
}) {
  return {
    mockSaveSecret: vi
      .fn()
      .mockImplementation(
        options?.saveSecretImplementation ||
          (() => Promise.resolve({ key: 'test-key' }))
      ),
    mockCreateWorkload: vi.fn(),
    mockGetIsServerReady: vi
      .fn()
      .mockImplementation(
        options?.getIsServerReadyImplementation || (() => Promise.resolve(true))
      ),
    mockQueryClient: {
      invalidateQueries: vi.fn(),
    } as unknown as QueryClient,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('submits without any optional fields', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'foo-bar',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockSaveSecret).toHaveBeenCalledTimes(0)
  expect(mockGetIsServerReady).toHaveBeenCalledTimes(1)
  expect(mockCreateWorkload).toHaveBeenCalledTimes(1)
  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: {
      name: 'foo-bar',
      image: 'ghcr.io/github/github-mcp-server',
      transport: 'stdio',
      secrets: [],
      cmd_arguments: [],
      env_vars: [],
    },
  })
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: getApiV1BetaWorkloadsQueryKey({ query: { all: true } }),
  })

  expect(toast.success).toHaveBeenCalledWith(
    '"foo-bar" started successfully.',
    expect.any(Object)
  )

  expect(mockStartSpan).toHaveBeenCalledWith(
    {
      name: 'Workload foo-bar started',
      op: 'user.event',
      attributes: {
        'analytics.source': 'tracking',
        'analytics.type': 'event',
        workload: 'foo-bar',
        transport: 'stdio',
        'route.pathname': '/',
        timestamp: expect.any(String),
      },
    },
    expect.any(Function)
  )
})

it('handles new secrets properly', async () => {
  server.use(
    http.get(mswEndpoint('/api/v1beta/secrets/default/keys'), () => {
      return HttpResponse.json({ keys: [] })
    })
  )

  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'foo-bar',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        value: { isFromStore: false, secret: 'foo-bar' },
      },
    ],
    cmd_arguments: '',
  } as const satisfies FormSchemaRunMcpCommand
  mockSaveSecret.mockResolvedValueOnce({ key: DATA.secrets[0].name })

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockSaveSecret).toHaveBeenCalledWith(
    { body: { key: 'GITHUB_PERSONAL_ACCESS_TOKEN', value: 'foo-bar' } },
    expect.any(Object)
  )

  expect(mockGetIsServerReady).toHaveBeenCalledTimes(1)
  expect(mockCreateWorkload).toHaveBeenCalledTimes(1)
  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: {
      name: 'foo-bar',
      image: 'ghcr.io/github/github-mcp-server',
      transport: 'stdio',
      secrets: [
        {
          name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
          target: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        },
      ],
      cmd_arguments: [],
      env_vars: [],
    },
  })
  expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
    queryKey: getApiV1BetaWorkloadsQueryKey({ query: { all: true } }),
  })

  expect(toast.success).toHaveBeenCalledWith(
    '"foo-bar" started successfully.',
    expect.any(Object)
  )
})

it('handles existing secrets from the store properly', async () => {
  server.use(
    http.get(mswEndpoint('/api/v1beta/secrets/default/keys'), () => {
      return HttpResponse.json({
        keys: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN' }],
      })
    })
  )

  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'existing-foo-bar',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        value: { isFromStore: true, secret: 'GITHUB_PERSONAL_ACCESS_TOKEN' },
      },
    ],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockSaveSecret).not.toHaveBeenCalled()
  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      secrets: [
        {
          name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
          target: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        },
      ],
    }),
  })
})

it('handles naming collisions with secrets from the store', async () => {
  server.use(
    http.get(mswEndpoint('/api/v1beta/secrets/default/keys'), () => {
      return HttpResponse.json({
        keys: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN' }],
      })
    })
  )

  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'existing-foo-bar',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        value: { isFromStore: false, secret: 'foo-bar' },
      },
    ],
    cmd_arguments: '',
  }
  mockSaveSecret.mockResolvedValueOnce({
    key: 'GITHUB_PERSONAL_ACCESS_TOKEN_2', // Suffix for naming collision
  })

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockSaveSecret).toHaveBeenCalledWith(
    { body: { key: 'GITHUB_PERSONAL_ACCESS_TOKEN_2', value: 'foo-bar' } },
    expect.any(Object)
  )

  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      secrets: [
        {
          name: 'GITHUB_PERSONAL_ACCESS_TOKEN_2',
          target: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        },
      ],
    }),
  })
})

it('handles both new and existing secrets', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks({
    saveSecretImplementation: () => Promise.resolve({ key: 'new_secret_key' }),
  })

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'mixed-secrets-test',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [
      {
        name: 'NEW_API_KEY',
        value: { isFromStore: false, secret: 'new_value' },
      },
      {
        name: 'EXISTING_API_KEY',
        value: { isFromStore: true, secret: 'existing_key' },
      },
    ],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  // saveSecret should be called once for the new secret
  expect(mockSaveSecret).toHaveBeenCalledTimes(1)
  expect(mockSaveSecret).toHaveBeenCalledWith(
    { body: { key: expect.any(String), value: 'new_value' } },
    expect.any(Object)
  )

  // Check if createWorkload was called with both secrets properly mapped
  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      secrets: [
        { name: 'new_secret_key', target: 'NEW_API_KEY' },
        { name: 'existing_key', target: 'EXISTING_API_KEY' },
      ],
    }),
  })
})

it('handles error when saving a secret fails', async () => {
  const mockError = new Error('Failed to save secret')
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks({
    saveSecretImplementation: () => Promise.reject(mockError),
  })

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'failing-foo-bar',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        value: { isFromStore: false, secret: 'foo-bar' },
      },
    ],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  // createWorkload should not be called if saving secrets fails
  expect(mockCreateWorkload).not.toHaveBeenCalled()
  expect(mockGetIsServerReady).not.toHaveBeenCalled()

  // Error toast should be shown
  expect(toast.error).toHaveBeenCalledWith(
    'An error occurred while starting the server.\nFailed to save secret',
    expect.any(Object)
  )
})

it('handles environment variables properly', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'env-var-test',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [
      { name: 'DEBUG', value: 'true' },
      { name: 'PORT', value: '8080' },
    ],
    secrets: [],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      env_vars: ['DEBUG=true', 'PORT=8080'],
    }),
  })
})

it('filters out environment variables with empty values', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'env-var-filter-test',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [
      { name: 'DEBUG', value: 'true' },
      { name: 'PORT', value: '8080' },
      { name: 'OPTIONAL_VAR', value: '' }, // Empty value should be omitted
      { name: 'ANOTHER_OPTIONAL', value: '   ' }, // Whitespace-only should be omitted
      { name: 'REQUIRED_VAR', value: 'some-value' },
    ],
    secrets: [],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      env_vars: ['DEBUG=true', 'PORT=8080', 'REQUIRED_VAR=some-value'],
    }),
  })
  // OPTIONAL_VAR and ANOTHER_OPTIONAL should be omitted
  expect(mockCreateWorkload).toHaveBeenCalledWith(
    expect.not.objectContaining({
      body: expect.objectContaining({
        env_vars: expect.arrayContaining([
          'OPTIONAL_VAR=',
          'ANOTHER_OPTIONAL=   ',
        ]),
      }),
    })
  )
})

it('handles command arguments properly', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'cmd-arg-test',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [],
    cmd_arguments: '--debug --port 8080',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      cmd_arguments: ['--debug', '--port', '8080'],
    }),
  })
})

it('shows warning toast when server is not ready', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks({
    getIsServerReadyImplementation: () => Promise.resolve(false),
  })

  const DATA: FormSchemaRunMcpCommand = {
    image: 'ghcr.io/github/github-mcp-server',
    name: 'slow-server',
    transport: 'stdio',
    type: 'docker_image',
    envVars: [],
    secrets: [],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(toast.loading).toHaveBeenCalledWith(
    'Starting "slow-server"...',
    expect.any(Object)
  )
  expect(toast.warning).toHaveBeenCalledWith(
    'Server "slow-server" was created but may still be starting up. Check the servers list to monitor its status.',
    expect.any(Object)
  )
  expect(toast.success).not.toHaveBeenCalled()
})

it('handles package manager type properly', async () => {
  const {
    mockSaveSecret,
    mockCreateWorkload,
    mockGetIsServerReady,
    mockQueryClient,
  } = createTestMocks()

  const DATA: FormSchemaRunMcpCommand = {
    package_name: 'my-package',
    protocol: 'npx',
    name: 'npm-server',
    transport: 'stdio',
    type: 'package_manager',
    envVars: [],
    secrets: [],
    cmd_arguments: '',
  }

  await orchestrateRunCustomServer({
    createWorkload: mockCreateWorkload,
    data: DATA,
    getIsServerReady: mockGetIsServerReady,
    queryClient: mockQueryClient,
    saveSecret: mockSaveSecret,
  })

  expect(mockCreateWorkload).toHaveBeenCalledWith({
    body: expect.objectContaining({
      image: 'npx://my-package',
    }),
  })
})
