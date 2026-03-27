import { z } from 'zod';
import { normalizeScopeId } from '@/lib/constants/scope';

const languageSchema = z.enum(['zh-CN', 'en-US']);

const userRequirementsSchema = z.object({
  requirement: z.string().trim().min(1),
  language: languageSchema,
  userNickname: z.string().optional(),
  userBio: z.string().optional(),
  webSearch: z.boolean().optional(),
});

const sceneOutlineSchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.enum(['slide', 'quiz', 'interactive', 'pbl']),
    title: z.string().trim().min(1),
    description: z.string(),
    keyPoints: z.array(z.string()),
    order: z.number(),
    language: languageSchema.optional(),
  })
  .passthrough();

const optionalScopeSchema = z.string().optional().transform((value) => normalizeScopeId(value));
const selectedKnowledgeBaseSummarySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});
const selectedMemorySummarySchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1),
  contentPreview: z.string(),
});
const avatarDescriptionSchema = z.object({
  path: z.string().trim().min(1),
  desc: z.string(),
});
const availableVoiceSchema = z.object({
  providerId: z.string().trim().min(1),
  voiceId: z.string().trim().min(1),
  voiceName: z.string().trim().min(1),
});
const pblAgentSchema = z.object({
  name: z.string().trim().min(1),
  actor_role: z.string().trim().min(1),
  role_division: z.enum(['management', 'development']),
  system_prompt: z.string(),
  default_mode: z.string(),
  delay_time: z.number(),
  env: z.record(z.string(), z.unknown()),
  is_user_role: z.boolean(),
  is_active: z.boolean(),
  is_system_agent: z.boolean(),
});
const pblIssueSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
  person_in_charge: z.string(),
  participants: z.array(z.string()),
  notes: z.string(),
  parent_issue: z.string().nullable(),
  index: z.number(),
  is_done: z.boolean(),
  is_active: z.boolean(),
  generated_questions: z.string(),
  question_agent_name: z.string(),
  judge_agent_name: z.string(),
});
const chatMessageSchema = z.object({
  id: z.string().optional(),
  role: z.string().trim().min(1),
  content: z.unknown(),
});
const chatStoreStateSchema = z.object({
  stage: z.unknown().nullable(),
  scenes: z.array(z.unknown()),
  currentSceneId: z.string().nullable(),
  mode: z.enum(['edit', 'present', 'autonomous', 'playback']).or(z.string().trim().min(1)),
  whiteboardOpen: z.boolean(),
});
const chatConfigSchema = z.object({
  agentIds: z.array(z.string().trim().min(1)).min(1),
  sessionType: z.enum(['qa', 'discussion']).optional(),
  discussionTopic: z.string().optional(),
  discussionPrompt: z.string().optional(),
  triggerAgentId: z.string().optional(),
  agentConfigs: z.array(z.unknown()).optional(),
});
const chatUserProfileSchema = z.object({
  nickname: z.string().optional(),
  bio: z.string().optional(),
});
const knowledgeVideoReferenceSchema = z.object({
  fileId: z.string().trim().min(1),
  filename: z.string().trim().min(1),
  src: z.string().trim().min(1),
  poster: z.string().optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  score: z.number().finite().optional(),
});

export const sceneOutlinesStreamRequestSchema = z.object({
  requirements: userRequirementsSchema,
  pdfText: z.string().optional(),
  pdfImages: z.array(z.unknown()).optional(),
  imageMapping: z.record(z.string(), z.string()).optional(),
  researchContext: z.string().optional(),
  agents: z.array(z.unknown()).optional(),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).optional(),
  memoryIds: z.array(z.string().trim().min(1)).optional(),
  scopeId: optionalScopeSchema,
  enableKnowledgeRetrieval: z.boolean().optional(),
  enableMemoryRetrieval: z.boolean().optional(),
  preferKnowledgeVideos: z.boolean().optional(),
});

export const sceneContentRequestSchema = z.object({
  outline: sceneOutlineSchema,
  allOutlines: z.array(sceneOutlineSchema).min(1),
  pdfImages: z.array(z.unknown()).optional(),
  imageMapping: z.record(z.string(), z.string()).optional(),
  stageInfo: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    language: languageSchema.optional(),
    style: z.string().optional(),
  }),
  stageId: z.string().trim().min(1),
  agents: z.array(z.unknown()).optional(),
  scopeId: optionalScopeSchema,
  knowledgeVideoReferences: z.array(knowledgeVideoReferenceSchema).optional(),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).optional(),
  memoryIds: z.array(z.string().trim().min(1)).optional(),
  enableKnowledgeRetrieval: z.boolean().optional(),
  enableMemoryRetrieval: z.boolean().optional(),
  preferKnowledgeVideos: z.boolean().optional(),
});

export const sceneActionsRequestSchema = z.object({
  outline: sceneOutlineSchema,
  allOutlines: z.array(sceneOutlineSchema).min(1),
  content: z.unknown(),
  stageId: z.string().trim().min(1),
  agents: z.array(z.unknown()).optional(),
  previousSpeeches: z.array(z.string()).optional(),
  userProfile: z.string().optional(),
});

export const generateClassroomRequestSchema = z.object({
  requirement: z.string().trim().min(1),
  scopeId: optionalScopeSchema,
  pdfContent: z
    .object({
      text: z.string(),
      images: z.array(z.string()),
    })
    .optional(),
  language: languageSchema.optional(),
  enableWebSearch: z.boolean().optional(),
  enableImageGeneration: z.boolean().optional(),
  enableVideoGeneration: z.boolean().optional(),
  enableTTS: z.boolean().optional(),
  knowledgeBaseIds: z.array(z.string().trim().min(1)).optional(),
  memoryIds: z.array(z.string().trim().min(1)).optional(),
  enableKnowledgeRetrieval: z.boolean().optional(),
  enableMemoryRetrieval: z.boolean().optional(),
  preferKnowledgeVideos: z.boolean().optional(),
  selectedKnowledgeBases: z.array(selectedKnowledgeBaseSummarySchema).optional(),
  selectedMemories: z.array(selectedMemorySummarySchema).optional(),
  agentMode: z.enum(['preset', 'auto', 'default', 'generate']).optional(),
});

export const agentProfilesRequestSchema = z.object({
  stageInfo: z.object({
    name: z.string().trim().min(1),
    description: z.string().optional(),
  }),
  sceneOutlines: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        description: z.string().optional(),
      }),
    )
    .optional(),
  language: languageSchema,
  availableAvatars: z.array(z.string().trim().min(1)).min(1),
  avatarDescriptions: z.array(avatarDescriptionSchema).optional(),
  availableVoices: z.array(availableVoiceSchema).optional(),
});

export const imageGenerationRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  negativePrompt: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  style: z.string().optional(),
});

export const videoGenerationRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  duration: z.number().positive().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
});

export const ttsGenerationRequestSchema = z.object({
  text: z.string().trim().min(1),
  audioId: z.string().trim().min(1),
  ttsProviderId: z.string().trim().min(1),
  ttsVoice: z.string().trim().min(1),
  ttsSpeed: z.number().positive().optional(),
  ttsApiKey: z.string().optional(),
  ttsBaseUrl: z.string().optional(),
});

export const statelessChatRequestSchema = z.object({
  messages: z.array(chatMessageSchema),
  storeState: chatStoreStateSchema,
  config: chatConfigSchema,
  directorState: z.unknown().optional(),
  userProfile: chatUserProfileSchema.optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  providerType: z.string().optional(),
  requiresApiKey: z.boolean().optional(),
});

export const quizGradeRequestSchema = z.object({
  question: z.string().trim().min(1),
  userAnswer: z.string().trim().min(1),
  points: z.number().finite().nonnegative(),
  commentPrompt: z.string().optional(),
  language: languageSchema.optional(),
});

export const azureVoicesRequestSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseUrl: z.string().trim().min(1),
});

export const proxyMediaRequestSchema = z.object({
  url: z.string().trim().min(1),
});

export const verifyModelRequestSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().trim().min(1),
  providerType: z.string().optional(),
  requiresApiKey: z.boolean().optional(),
});

export const verifyPdfProviderRequestSchema = z.object({
  providerId: z.string().trim().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export const pblChatRequestSchema = z.object({
  message: z.string().trim().min(1),
  agent: pblAgentSchema,
  currentIssue: pblIssueSchema.nullable(),
  recentMessages: z.array(
    z.object({
      agent_name: z.string().trim().min(1),
      message: z.string(),
    }),
  ),
  userRole: z.string(),
  agentType: z.enum(['question', 'judge']).optional(),
});
