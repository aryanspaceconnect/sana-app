import { zodToJsonSchema } from 'zod-to-json-schema';
import { SANA_TOOL_REGISTRY } from './tools.js';
import { ToolDefinition } from './types.js';

export function getGeminiToolDeclarations() {
  const functionDeclarations = SANA_TOOL_REGISTRY.map((tool: ToolDefinition) => {
    const rawSchema = zodToJsonSchema(tool.parameters as any, tool.name);
    // Extract property schema removing $schema meta header
    let parameters: any = { type: 'object', properties: {} };
    if ('definitions' in rawSchema && rawSchema.definitions && rawSchema.definitions[tool.name]) {
      parameters = rawSchema.definitions[tool.name];
    } else if (rawSchema) {
      parameters = { ...rawSchema };
      delete parameters.$schema;
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters
    };
  });

  return [
    {
      functionDeclarations
    }
  ];
}

export function findToolByName(name: string): ToolDefinition | undefined {
  return SANA_TOOL_REGISTRY.find(t => t.name === name);
}
