import { z } from 'zod';
import { ToolDefinition, UniversalQuery, AgentContext, ActionProposal } from './types.js';
import { SANA_APP_MAP } from './soul.js';
import { saveMemoryNoteDirectly } from './workspace.js';

// Universal Search Tool
export const universalSearchToolSchema = z.object({
  queries: z.array(z.object({
    type: z.enum(['scans', 'incidents', 'events', 'settings_history', 'profile', 'insights', 'app_help']),
    query: z.string().optional(),
    daysLimit: z.number().optional(),
    settingKey: z.string().optional(),
  }))
});

export const universalSearchTool: ToolDefinition = {
  name: 'universal_search',
  description: 'Search across all SANA workspace data layers in parallel: facial scans, incident logs, scheduled regimen events, setting history, user profile, insights, or UI help.',
  parameters: universalSearchToolSchema,
  execute: async (args: z.infer<typeof universalSearchToolSchema>, context: AgentContext) => {
    const results: Record<string, any> = {};

    for (const q of args.queries) {
      switch (q.type) {
        case 'profile':
          results.profile = context.profile || {
            skinType: 'Combination / Sensitive',
            primaryConcerns: ['Redness', 'Dehydration', 'Active Acne'],
            barrierStatus: 'Slightly Compromised',
            allergies: ['Fragrance', 'High Ethanol'],
            currentRoutine: {
              AM: ['Gentle Cleanser', 'Hyaluronic Serum', 'Ceramide Cream', 'SPF 50'],
              PM: ['Oil Cleanser', 'Gentle Cleanser', '0.025% Tretinoin (3x/wk)', 'Lipid Barrier Balm']
            }
          };
          break;

        case 'scans':
          results.scans = (context.latestScan ? [context.latestScan] : [
            {
              id: 'scan_recent_01',
              date: new Date().toISOString(),
              hydrationScore: 68,
              barrierScore: 74,
              clarityScore: 82,
              rednessLevel: 'Moderate',
              notes: 'Mild cheek erythema detected near nasal fold.'
            }
          ]);
          break;

        case 'incidents':
          results.incidents = context.incidents || [
            {
              id: 'inc_101',
              title: 'Stinging after BHA exfoliant',
              date: new Date(Date.now() - 86400000 * 2).toISOString(),
              severity: 'moderate',
              triggers: ['Salicylic Acid 2%', 'Hot Shower'],
              status: 'resolving'
            }
          ];
          break;

        case 'events':
          results.events = context.events || [
            {
              id: 'evt_201',
              title: 'PM Barrier Recovery Protocol',
              date: new Date().toISOString().split('T')[0],
              category: 'routine',
              completed: false
            }
          ];
          break;

        case 'settings_history':
          if (q.settingKey && context.settingsHistory?.[q.settingKey]) {
            results[`settings_history_${q.settingKey}`] = context.settingsHistory[q.settingKey];
          } else {
            results.settings_history = context.settingsHistory || {
              aiSensitivity: [
                { timestamp: new Date(Date.now() - 86400000 * 7).toISOString(), value: 'standard' },
                { timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), value: 'high' }
              ],
              uvAlerts: [
                { timestamp: new Date(Date.now() - 86400000 * 14).toISOString(), value: true }
              ]
            };
          }
          break;

        case 'insights':
          results.insights = [
            {
              category: 'Ingredient Interaction',
              finding: 'Combining BHA and Retinoid on consecutive nights elevated skin irritation index by 35%.',
              recommendation: 'Alternate BHA and Retinoid with at least 48 hours of barrier recovery in between.'
            }
          ];
          break;

        case 'app_help':
          results.app_help = {
            appMap: SANA_APP_MAP,
            query: q.query,
            guidance: 'SANA features Home Dashboard, AI Agent Chat, Regimen Calendar, and Facial Scan Modal.'
          };
          break;
      }
    }

    return results;
  }
};

// Propose Update Setting Tool
export const proposeUpdateSettingSchema = z.object({
  key: z.string(),
  value: z.any(),
  reason: z.string().optional()
});

export const proposeUpdateSettingTool: ToolDefinition = {
  name: 'propose_update_setting',
  description: 'Propose an update to user preference or application setting (e.g. UV alert threshold, AI response sensitivity, skin concern emphasis). Returns an actionProposal requiring user approval.',
  parameters: proposeUpdateSettingSchema,
  execute: async (args: z.infer<typeof proposeUpdateSettingSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Update Preference: ${args.key}`,
        description: `Change setting '${args.key}' to '${JSON.stringify(args.value)}'. ${args.reason ? `Reason: ${args.reason}` : ''}`,
        actionType: 'UPDATE_SETTING',
        payload: {
          key: args.key,
          value: args.value,
          reason: args.reason || 'Requested preference optimization'
        },
        riskLevel: 'low'
      }
    };
  }
};

// Propose Create Event Tool
export const proposeCreateEventSchema = z.object({
  title: z.string(),
  date: z.string(),
  time: z.string().optional(),
  category: z.enum(['routine', 'scan', 'treatment', 'habit']),
  notes: z.string().optional()
});

export const proposeCreateEventTool: ToolDefinition = {
  name: 'propose_create_event',
  description: 'Propose scheduling a skincare routine, facial scan, or barrier check event in the Regimen Calendar. Returns an actionProposal requiring user approval.',
  parameters: proposeCreateEventSchema,
  execute: async (args: z.infer<typeof proposeCreateEventSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Schedule Calendar Event: ${args.title}`,
        description: `Schedule '${args.title}' (${args.category.toUpperCase()}) on ${args.date}${args.time ? ` at ${args.time}` : ''}.`,
        actionType: 'CREATE_EVENT',
        payload: {
          title: args.title,
          date: args.date,
          time: args.time || '20:00',
          category: args.category,
          notes: args.notes || '',
          completed: false
        },
        riskLevel: 'low'
      }
    };
  }
};

// Propose Log Incident Tool
export const proposeLogIncidentSchema = z.object({
  title: z.string(),
  severity: z.enum(['mild', 'moderate', 'severe']),
  triggers: z.array(z.string()).optional(),
  description: z.string().optional()
});

export const proposeLogIncidentTool: ToolDefinition = {
  name: 'propose_log_incident',
  description: 'Propose logging a skin reaction or flare-up incident to track causes and recovery progress over time. Returns an actionProposal requiring user approval.',
  parameters: proposeLogIncidentSchema,
  execute: async (args: z.infer<typeof proposeLogIncidentSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Log Reaction Incident: ${args.title}`,
        description: `Log skin incident '${args.title}' with severity '${args.severity.toUpperCase()}'. Triggers: ${args.triggers?.join(', ') || 'None specified'}.`,
        actionType: 'LOG_INCIDENT',
        payload: {
          title: args.title,
          severity: args.severity,
          triggers: args.triggers || [],
          description: args.description || '',
          timestamp: new Date().toISOString(),
          status: 'active'
        },
        riskLevel: args.severity === 'severe' ? 'medium' : 'low'
      }
    };
  }
};

// Propose Generate Protocol Tool
export const proposeGenerateProtocolSchema = z.object({
  title: z.string(),
  steps: z.array(z.object({
    stepNumber: z.number(),
    timeOfDay: z.enum(['AM', 'PM']),
    productOrAction: z.string(),
    notes: z.string().optional()
  }))
});

export const proposeGenerateProtocolTool: ToolDefinition = {
  name: 'propose_generate_protocol',
  description: 'Propose updating or adding a structured multi-step skincare regimen protocol. Returns an actionProposal requiring user approval.',
  parameters: proposeGenerateProtocolSchema,
  execute: async (args: z.infer<typeof proposeGenerateProtocolSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_proto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Apply Skincare Protocol: ${args.title}`,
        description: `Adopt ${args.steps.length}-step skin protocol '${args.title}' targeting barrier repair and routine clarity.`,
        actionType: 'GENERATE_PROTOCOL',
        payload: {
          title: args.title,
          steps: args.steps,
          createdAt: new Date().toISOString()
        },
        riskLevel: 'medium'
      }
    };
  }
};

// Save Memory Note Tool (Direct memory writing - no approval card needed)
export const saveMemoryNoteSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  incidentDate: z.string().optional()
});

export const saveMemoryNoteTool: ToolDefinition = {
  name: 'save_memory_note',
  description: 'Directly save an observation, symptom, pimple/flare-up incident, or skin memory note into user memory. DOES NOT require action approval cards.',
  parameters: saveMemoryNoteSchema,
  execute: async (args: z.infer<typeof saveMemoryNoteSchema>, context: AgentContext) => {
    const record = await saveMemoryNoteDirectly(context.userId, {
      title: args.title,
      description: args.description || args.title,
      category: args.category || 'incident',
      date: args.incidentDate || new Date().toISOString()
    });
    return {
      success: true,
      message: `Memory note '${args.title}' was directly saved into user skin memory.`,
      savedRecord: record
    };
  }
};

export const SANA_TOOL_REGISTRY: ToolDefinition[] = [
  universalSearchTool,
  saveMemoryNoteTool,
  proposeUpdateSettingTool,
  proposeCreateEventTool,
  proposeLogIncidentTool,
  proposeGenerateProtocolTool
];
