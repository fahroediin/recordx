import { MOM } from '../utils/constants.js';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/**
 * Check if AI MoM generation is available
 * @returns {boolean}
 */
export function isAIAvailable() {
  return !!OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here';
}

/**
 * Generate Minutes of Meeting from a transcript using OpenAI
 * @param {string} transcript - Full transcript text
 * @param {object} [options]
 * @param {string} [options.language='id'] - Output language ('id' for Indonesian, 'en' for English)
 * @param {string} [options.meetingTitle] - Optional meeting title
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function generateMoM(transcript, options = {}) {
  if (!isAIAvailable()) {
    return { data: null, error: new Error('OpenAI API key not configured') };
  }

  const language = options.language || 'id';
  const langInstruction = language === 'id'
    ? 'Tulis output dalam Bahasa Indonesia.'
    : 'Write the output in English.';

  const prompt = `You are an expert meeting note-taker. Analyze the following transcript and generate structured Minutes of Meeting (MoM).

${langInstruction}

${options.meetingTitle ? `Meeting Title: ${options.meetingTitle}\n` : ''}

TRANSCRIPT:
"""
${truncateTranscript(transcript)}
"""

Generate a structured MoM in the following JSON format:
{
  "title": "Meeting title (inferred from content if not provided)",
  "date": "Meeting date (inferred or today's date)",
  "participants": ["List of identified participants/speakers"],
  "summary": "Brief 2-3 sentence summary of the meeting",
  "agenda_items": [
    {
      "topic": "Agenda topic",
      "discussion": "Key discussion points",
      "decisions": ["Decisions made"],
      "action_items": [
        {
          "task": "Action item description",
          "assignee": "Person responsible (if mentioned)",
          "deadline": "Deadline (if mentioned)"
        }
      ]
    }
  ],
  "next_steps": ["List of next steps"],
  "notes": "Any additional notes or observations"
}

Return ONLY the JSON object, no markdown formatting or code blocks.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MOM.OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a professional meeting note-taker. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        data: null,
        error: new Error(errorData.error?.message || `OpenAI API error: ${response.status}`),
      };
    }

    const result = await response.json();
    const content = result.choices[0]?.message?.content;

    if (!content) {
      return { data: null, error: new Error('No content in AI response') };
    }

    // Parse the JSON response
    const mom = JSON.parse(content);
    return { data: mom, error: null };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { data: null, error: new Error('Failed to parse AI response as JSON') };
    }
    return { data: null, error: err };
  }
}

/**
 * Get a blank MoM template
 * @returns {object}
 */
export function getBlankTemplate() {
  return {
    title: '',
    date: new Date().toISOString().slice(0, 10),
    participants: [],
    summary: '',
    agenda_items: [
      {
        topic: '',
        discussion: '',
        decisions: [''],
        action_items: [
          {
            task: '',
            assignee: '',
            deadline: '',
          },
        ],
      },
    ],
    next_steps: [''],
    notes: '',
  };
}

/**
 * Convert a MoM object to Markdown format
 * @param {object} mom - MoM object
 * @returns {string} Markdown text
 */
export function momToMarkdown(mom) {
  let md = '';

  md += `# ${mom.title || 'Minutes of Meeting'}\n\n`;
  md += `**Date:** ${mom.date || '-'}\n\n`;

  if (mom.participants?.length > 0) {
    md += `**Participants:** ${mom.participants.join(', ')}\n\n`;
  }

  if (mom.summary) {
    md += `## Summary\n${mom.summary}\n\n`;
  }

  if (mom.agenda_items?.length > 0) {
    md += `## Agenda & Discussion\n\n`;
    mom.agenda_items.forEach((item, i) => {
      md += `### ${i + 1}. ${item.topic || 'Untitled'}\n\n`;

      if (item.discussion) {
        md += `**Discussion:**\n${item.discussion}\n\n`;
      }

      if (item.decisions?.length > 0 && item.decisions.some(d => d)) {
        md += `**Decisions:**\n`;
        item.decisions.filter(d => d).forEach((d) => {
          md += `- ${d}\n`;
        });
        md += '\n';
      }

      if (item.action_items?.length > 0 && item.action_items.some(a => a.task)) {
        md += `**Action Items:**\n`;
        md += '| Task | Assignee | Deadline |\n|------|----------|----------|\n';
        item.action_items.filter(a => a.task).forEach((a) => {
          md += `| ${a.task} | ${a.assignee || '-'} | ${a.deadline || '-'} |\n`;
        });
        md += '\n';
      }
    });
  }

  if (mom.next_steps?.length > 0 && mom.next_steps.some(s => s)) {
    md += `## Next Steps\n`;
    mom.next_steps.filter(s => s).forEach((step) => {
      md += `- ${step}\n`;
    });
    md += '\n';
  }

  if (mom.notes) {
    md += `## Notes\n${mom.notes}\n`;
  }

  return md;
}

/**
 * Truncate transcript to fit within token limits
 * @private
 */
function truncateTranscript(text) {
  // Rough approximation: 1 token ≈ 4 characters
  const maxChars = MOM.MAX_TRANSCRIPT_TOKENS * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n\n[... transcript truncated for length ...]';
}
