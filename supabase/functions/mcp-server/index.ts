// supabase/functions/mcp-server/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Server } from 'npm:@modelcontextprotocol/sdk/server/index.js'
import { HttpServerTransport } from 'npm:@modelcontextprotocol/sdk/server/http.js'
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from 'npm:@modelcontextprotocol/sdk/types.js'
import { createClient } from 'npm:@supabase/supabase-js'

// Initialize Supabase client (using env vars that will be set in Supabase dashboard)
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Version will be automatically updated during release process
const VERSION = "0.1.0"

// Initialize MCP server
const server = new Server(
  {
    name: "StoryVerse MCP Server",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Example tool - we'll migrate the real tools later
const exampleTool = {
  name: "example_tool",
  description: "An example tool for testing the MCP server",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name to greet"
      }
    },
    required: ["name"]
  }
}

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [exampleTool]
}))

// Register tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params
    
    if (name === 'example_tool') {
      return {
        content: [
          {
            type: "text",
            text: `Hello ${args.name}! This is a test from the StoryVerse MCP server.`,
          },
        ],
      }
    }
    
    throw new Error(`Unknown tool: ${name}`)
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
})

// Create HTTP handler for Edge Function
serve(async (req) => {
  try {
    // Extract request body
    const body = await req.json()
    
    // Process MCP request
    const response = await server.handleMessage({
      body: JSON.stringify(body),
      headers: Object.fromEntries(req.headers.entries()),
    })
    
    // Return MCP response
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error('Error handling request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})