import { z } from 'zod';
import { ToolDefinition, UniversalQuery, AgentContext, ActionProposal } from './types.js';
import { SANA_APP_MAP } from './soul.js';
import { saveMemoryNoteDirectly } from './workspace.js';
import { getSessionNotepad, updateSessionNotepad } from './sessionNotepad.js';
import { executeWebSearch } from './searchService.js';
import {
  saveAgentVaultDocument,
  searchAgentVault,
  parseDocumentContent,
  vaultSearch,
  saveVaultIncident,
  saveVaultEvent,
  saveVaultGoal,
  saveVaultUserData,
  saveVaultSkinComposition,
  getVaultHistory,
  toAbsoluteTime
} from './agentVault.js';

// Universal Search Tool
export const universalSearchToolSchema = z.object({
  queries: z.array(z.object({
    type: z.string().optional().default('profile'),
    query: z.string().optional(),
    daysLimit: z.union([z.number(), z.string()]).optional(),
    settingKey: z.string().optional(),
  })).optional().default([{ type: 'profile' }])
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
  description: 'Directly save an observation, symptom, pimple/flare-up incident, or skin memory note into user isolated Agent Memory Vault. DOES NOT require action approval cards.',
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
      message: `Memory note '${args.title}' was directly saved into user skin memory vault.`,
      savedRecord: record
    };
  }
};

// Ingest Document into Agent Vault
export const ingestDocumentSchema = z.object({
  filename: z.string(),
  content: z.string(),
  fileType: z.string().optional()
});

export const ingestDocumentTool: ToolDefinition = {
  name: 'ingest_document_to_vault',
  description: 'Parse and index an uploaded PDF, document, routine guide, or lab report text directly into the user isolated Agent Memory Vault for future recall.',
  parameters: ingestDocumentSchema,
  execute: async (args: z.infer<typeof ingestDocumentSchema>, context: AgentContext) => {
    const parsed = parseDocumentContent(args.filename, args.content);
    const savedDoc = await saveAgentVaultDocument(context.userId, {
      title: parsed.title,
      content: parsed.content,
      summary: parsed.summary,
      fileType: args.fileType || 'text/plain'
    });
    return {
      success: true,
      message: `Document '${args.filename}' successfully parsed and indexed in user's isolated Agent Vault.`,
      documentId: savedDoc.id,
      summary: savedDoc.summary
    };
  }
};

// Search Agent Memory Vault
export const searchAgentVaultSchema = z.object({
  query: z.string()
});

export const searchAgentVaultTool: ToolDefinition = {
  name: 'search_agent_vault',
  description: 'Query the user isolated Agent Memory Vault for past observations, skin memory notes, or uploaded documents.',
  parameters: searchAgentVaultSchema,
  execute: async (args: z.infer<typeof searchAgentVaultSchema>, context: AgentContext) => {
    const results = await searchAgentVault(context.userId, args.query);
    return {
      success: true,
      query: args.query,
      results
    };
  }
};

// Multi-Scope Advanced Vault Search Tool
export const vaultSearchSchema = z.object({
  scope: z.enum(['sessions', 'incidents', 'events', 'goals', 'skin_profile', 'user_data', 'notes', 'documents', 'all']).optional().default('all'),
  mode: z.enum(['keyword', 'vector', 'auto']).optional().default('auto'),
  query: z.string(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().optional().default(10)
});

export const vaultSearchTool: ToolDefinition = {
  name: 'vault_search',
  description: 'Multi-scope, date-filtered search across Sana Agent Vault: conversation sessions, flare/reaction incidents, scheduled events, skin goals, skin composition, user identity, notes, or uploaded documents.',
  parameters: vaultSearchSchema,
  execute: async (args: z.infer<typeof vaultSearchSchema>, context: AgentContext) => {
    const results = await vaultSearch(context.userId, {
      scope: args.scope,
      mode: args.mode,
      query: args.query,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      limit: args.limit
    });
    return {
      success: true,
      query: args.query,
      scope: args.scope,
      results
    };
  }
};

// Save Vault Incident Tool
export const saveVaultIncidentSchema = z.object({
  title: z.string(),
  occurredAt: z.string().optional(), // Can be relative like 'yesterday', '2 days ago' or ISO
  type: z.enum(['reaction', 'breakout', 'flare', 'allergy', 'other']).optional().default('flare'),
  severity: z.enum(['mild', 'moderate', 'severe']).optional().default('mild'),
  bodyAreas: z.array(z.string()).optional().default(['face']),
  description: z.string().optional(),
  suspectedTriggers: z.array(z.string()).optional().default([]),
  relatedProducts: z.array(z.string()).optional().default([]),
  relatedIngredients: z.array(z.string()).optional().default([]),
  notes: z.string().optional()
});

export const saveVaultIncidentTool: ToolDefinition = {
  name: 'save_vault_incident',
  description: 'Directly record a skin reaction, flare-up, breakout, or allergy incident into Vault long-term memory. Automatically converts relative time expressions to absolute timestamps.',
  parameters: saveVaultIncidentSchema,
  execute: async (args: z.infer<typeof saveVaultIncidentSchema>, context: AgentContext) => {
    const saved = await saveVaultIncident(context.userId, args, 'sana');
    return {
      success: true,
      message: `Incident '${saved.title}' logged in Vault with absolute time (${saved.occurredAtDate}).`,
      incident: saved
    };
  }
};

// Save Vault Event Tool
export const saveVaultEventSchema = z.object({
  title: z.string(),
  scheduledAt: z.string().optional(), // Absolute or relative (e.g. 'tomorrow', '2026-08-10')
  category: z.string().optional().default('routine'),
  preparationProtocolId: z.string().optional(),
  outcomeNotes: z.string().optional()
});

export const saveVaultEventTool: ToolDefinition = {
  name: 'save_vault_event',
  description: 'Record a calendar regimen event or milestone in Vault with state machine status tracking (upcoming, today, completed, missed).',
  parameters: saveVaultEventSchema,
  execute: async (args: z.infer<typeof saveVaultEventSchema>, context: AgentContext) => {
    const saved = await saveVaultEvent(context.userId, args, 'sana');
    return {
      success: true,
      message: `Event '${saved.title}' created in Vault (status: ${saved.status}, date: ${saved.scheduledAtDate}).`,
      event: saved
    };
  }
};

// Save Vault Goal Tool
export const saveVaultGoalSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  metrics: z.array(z.object({
    name: z.string(),
    baseline: z.union([z.string(), z.number()]).optional(),
    current: z.union([z.string(), z.number()]).optional(),
    target: z.union([z.string(), z.number()]).optional()
  })).optional().default([]),
  status: z.enum(['active', 'achieved', 'abandoned', 'paused']).optional().default('active')
});

export const saveVaultGoalTool: ToolDefinition = {
  name: 'save_vault_goal',
  description: 'Create or update long-term skin health goals with tracked progress metrics and target dates.',
  parameters: saveVaultGoalSchema,
  execute: async (args: z.infer<typeof saveVaultGoalSchema>, context: AgentContext) => {
    const saved = await saveVaultGoal(context.userId, args, 'sana');
    return {
      success: true,
      message: `Goal '${saved.title}' saved in Vault.`,
      goal: saved
    };
  }
};

// Save User Identity Data Tool
export const saveUserIdentitySchema = z.object({
  fullName: z.string().optional().describe('Full name of the user (e.g. Aryan)'),
  preferredName: z.string().optional().describe('Preferred name or nickname (e.g. Ray)'),
  ageRange: z.string().optional().describe('Age or age bracket (e.g. 25-30)'),
  sexOrHormonalContext: z.string().optional().describe('Hormonal context or gender identity'),
  locationOrClimate: z.string().optional().describe('User city, state, country or climate (e.g. Bardoli, Gujarat, India / Humid Tropical)'),
  occupationOrLifestyle: z.string().optional().describe('Occupation or daily lifestyle environment'),
  languages: z.array(z.string()).optional(),
  permanentFacts: z.array(z.string()).optional().describe('List of key permanent facts about the user')
});

export const saveUserIdentityTool: ToolDefinition = {
  name: 'save_user_identity',
  description: 'Record core user identity details in Vault user_data/identity (fullName, preferredName, locationOrClimate, ageRange, sexOrHormonalContext, permanentFacts). CALL THIS TOOL whenever the user introduces themselves, shares their name, nickname, or location.',
  parameters: saveUserIdentitySchema,
  execute: async (args: z.infer<typeof saveUserIdentitySchema>, context: AgentContext) => {
    const saved = await saveVaultUserData(context.userId, 'identity', args, 'sana', 'Updated user identity data');
    return {
      success: true,
      message: 'User identity facts successfully saved in Agent Vault.',
      identity: saved
    };
  }
};

// Update Skin Composition Tool
export const updateSkinCompositionSchema = z.object({
  skinTypeTendency: z.string().optional(),
  barrierStatusPatterns: z.string().optional(),
  pigmentationTendency: z.string().optional(),
  texturePoreElasticity: z.string().optional(),
  knownTriggers: z.array(z.string()).optional()
});

export const updateSkinCompositionTool: ToolDefinition = {
  name: 'update_skin_composition',
  description: 'Progressively update user skin profile composition in Vault skin_profile/composition (skin type, barrier behavior, pigmentation, known triggers).',
  parameters: updateSkinCompositionSchema,
  execute: async (args: z.infer<typeof updateSkinCompositionSchema>, context: AgentContext) => {
    const saved = await saveVaultSkinComposition(context.userId, args, 'sana', 'Progressive skin composition update');
    return {
      success: true,
      message: 'Skin composition profile updated in Vault with version history.',
      composition: saved
    };
  }
};

// Get Vault Document History Tool
export const getVaultHistorySchema = z.object({
  category: z.string(),
  docId: z.string(),
  limit: z.number().optional().default(5)
});

export const getVaultHistoryTool: ToolDefinition = {
  name: 'get_vault_history',
  description: 'Retrieve lightweight version history diffs for any document in Vault. Returns all versions if total <= 3.',
  parameters: getVaultHistorySchema,
  execute: async (args: z.infer<typeof getVaultHistorySchema>, context: AgentContext) => {
    const history = await getVaultHistory(context.userId, args.category, args.docId, args.limit);
    return {
      success: true,
      category: args.category,
      docId: args.docId,
      versionCount: history.length,
      history
    };
  }
};

export const updateSessionNotepadSchema = z.object({
  content: z.string().describe('The content or working notes to store in the session scratchpad.'),
  mode: z.enum(['append', 'replace']).optional().default('replace')
});

export const updateSessionNotepadTool: ToolDefinition = {
  name: 'update_session_notepad',
  description: "Saves or updates working notes in SANA's private session scratchpad. Use this to record user constraints, skin observations, calculated metrics, working hypotheses, or sub-task progress for the current session.",
  parameters: updateSessionNotepadSchema,
  execute: async (args: z.infer<typeof updateSessionNotepadSchema>, context: AgentContext) => {
    const updated = updateSessionNotepad(context.sessionId, args.content, args.mode);
    return {
      success: true,
      message: 'Session notepad updated successfully.',
      notepadContent: updated
    };
  }
};

export const readSessionNotepadSchema = z.object({});

export const readSessionNotepadTool: ToolDefinition = {
  name: 'read_session_notepad',
  description: "Reads SANA's private working notes from the current session scratchpad.",
  parameters: readSessionNotepadSchema,
  execute: async (_args: any, context: AgentContext) => {
    const content = getSessionNotepad(context.sessionId);
    return {
      success: true,
      notepadContent: content || '(Empty session notepad)'
    };
  }
};

export const triggerPopUpCardSchema = z.object({
  title: z.string().min(3).max(40).describe('Concise headline title for the pop-up (10-30 characters recommended).'),
  subtitle: z.string().describe('Short descriptive body or recommendation summary.'),
  actionText: z.string().optional().default('Start Routine').describe('Button label for the primary action.'),
  iconType: z.enum(['scan', 'sun', 'sparkle', 'shield', 'droplet', 'clock', 'alert']).optional().default('sparkle'),
  badgeText: z.string().optional().default('SANA AGENT ALERT').describe('Small upper badge label.'),
  actionTarget: z.enum(['scan', 'calendar', 'reports', 'vault', 'agent']).optional().default('scan')
});

export const triggerPopUpCardTool: ToolDefinition = {
  name: 'trigger_popup_card',
  description: "Triggers a prominent, floating Action Pop-Up Card directly on the user's mobile screen above the navigation bar. Use this to prompt immediate user actions like daily facial scans, routine alerts, or skin check reminders.",
  parameters: triggerPopUpCardSchema,
  execute: async (args: z.infer<typeof triggerPopUpCardSchema>, _context: AgentContext) => {
    return {
      success: true,
      message: 'Action Pop-Up Card queued successfully.',
      popupCard: {
        id: `popup_${Date.now()}`,
        type: 'custom_action',
        title: args.title,
        subtitle: args.subtitle,
        timeAgo: 'Just now',
        actionText: args.actionText,
        iconType: args.iconType,
        badgeText: args.badgeText,
        actionTarget: args.actionTarget
      }
    };
  }
};

export const webSearchSchema = z.object({
  query: z.string().min(2).describe('Search query for dermatology research, ingredients, climate data, or medical guidelines.')
});

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search clinical databases (PubMed, DermNet, formulation databases) and live web resources for skin barrier research, ingredient safety, climate effects, and medical guidelines. Use this tool whenever up-to-date research or evidence is required.',
  parameters: webSearchSchema,
  execute: async (args: z.infer<typeof webSearchSchema>, _context: AgentContext) => {
    return await executeWebSearch(args.query);
  }
};

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch and search real live web search results from Google Search API for a given query, URL, or skin health topic.',
  parameters: webSearchSchema,
  execute: async (args: z.infer<typeof webSearchSchema>, _context: AgentContext) => {
    return await executeWebSearch(args.query);
  }
};

export const SANA_TOOL_REGISTRY: ToolDefinition[] = [
  webSearchTool,
  webFetchTool,
  triggerPopUpCardTool,
  updateSessionNotepadTool,
  readSessionNotepadTool,
  universalSearchTool,
  vaultSearchTool,
  saveMemoryNoteTool,
  saveVaultIncidentTool,
  saveVaultEventTool,
  saveVaultGoalTool,
  saveUserIdentityTool,
  updateSkinCompositionTool,
  getVaultHistoryTool,
  ingestDocumentTool,
  searchAgentVaultTool,
  proposeUpdateSettingTool,
  proposeCreateEventTool,
  proposeLogIncidentTool,
  proposeGenerateProtocolTool
];
