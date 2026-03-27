/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { parseJsonRequestWithSchema } from '@/lib/server/http-validation';
import { quizGradeRequestSchema } from '@/lib/server/generation/contracts';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';

const log = createLogger('Quiz Grade');

interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await parseJsonRequestWithSchema(req, quizGradeRequestSchema);
    if (!parsed.success) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, parsed.error);
    }

    const body = parsed.data as GradeRequest;
    const { question, userAnswer, points, commentPrompt, language } = body;

    const { model: languageModel } = resolveModelFromHeaders(req);
    const isZh = language === 'zh-CN';

    const systemPrompt = isZh
      ? `\u4f60\u662f\u4e00\u4f4d\u4e13\u4e1a\u7684\u6559\u80b2\u8bc4\u4f30\u4e13\u5bb6\u3002\u8bf7\u6839\u636e\u9898\u76ee\u548c\u5b66\u751f\u7b54\u6848\u8fdb\u884c\u8bc4\u5206\u5e76\u7ed9\u51fa\u7b80\u77ed\u8bc4\u8bed\u3002
\u5fc5\u987b\u4ec5\u4ee5\u5982\u4e0b JSON \u683c\u5f0f\u56de\u590d\uff0c\u4e0d\u8981\u5305\u542b\u4efb\u4f55\u989d\u5916\u5185\u5bb9\uff1a
{"score": <0\u5230${points}\u7684\u6574\u6570>, "comment": "<\u4e00\u4e24\u53e5\u8bc4\u8bed>"}`
      : `You are a professional educational assessor. Grade the student's answer and provide brief feedback.
You must reply in the following JSON format only (no other content):
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences of feedback>"}`;

    const userPrompt = isZh
      ? `\u9898\u76ee\uff1a${question}
\u6ee1\u5206\uff1a${points}\u5206
${commentPrompt ? `\u8bc4\u5206\u8981\u70b9\uff1a${commentPrompt}\n` : ''}\u5b66\u751f\u7b54\u6848\uff1a${userAnswer}`
      : `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Student answer: ${userAnswer}`;

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
      },
      'quiz-grade',
    );

    const text = result.text.trim();
    let gradeResult: GradeResponse;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsedJson = JSON.parse(jsonMatch[0]);
      gradeResult = {
        score: Math.max(0, Math.min(points, Math.round(Number(parsedJson.score)))),
        comment: String(parsedJson.comment || ''),
      };
    } catch {
      gradeResult = {
        score: Math.round(points * 0.5),
        comment: isZh
          ? '\u5df2\u4f5c\u7b54\uff0c\u8bf7\u53c2\u8003\u6807\u51c6\u7b54\u6848\u3002'
          : 'Answer received. Please refer to the standard answer.',
      };
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error('Error:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
