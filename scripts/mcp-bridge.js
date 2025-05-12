#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const { Server } = require('@modelcontextprotocol/sdk/server');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types');

// Create MCP server for Claude
const server = new Server(
  {
    name: "StoryVerse MCP Bridge",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to make HTTP requests to our Edge Function
async function callEdgeFunction(data) {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const url = 'https://rkmjjhjjpnhjymqmcvpe.supabase.co/functions/v1/mcp-server';
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(JSON.stringify(data));
    req.end();
  });
}

// Register tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  try {
    const result = await callEdgeFunction({ type: "list_tools" });
    return result;
  } catch (error) {
    console.error("Error in ListToolsRequestSchema handler:", error);
    return { tools: [] };
  }
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await callEdgeFunction({
      type: "call_tool",
      params: request.params
    });
    return result;
  } catch (error) {
    console.error("Error in CallToolRequestSchema handler:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start MCP server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Bridge running on stdio");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

main();