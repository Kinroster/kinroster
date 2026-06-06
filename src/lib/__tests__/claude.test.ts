import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

// Mock Anthropic SDK to avoid browser detection error
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}));

// Import after mock
const { parseJsonResponse } = await import('../claude');

describe('parseJsonResponse', () => {
  it('parses valid JSON', () => {
    const result = parseJsonResponse<{ foo: string }>('{"foo": "bar"}');
    expect(result.foo).toBe('bar');
  });

  it('strips markdown code fences', () => {
    const result = parseJsonResponse<{ foo: string }>('```json\n{"foo": "bar"}\n```');
    expect(result.foo).toBe('bar');
  });

  it('strips code fences without language hint', () => {
    const result = parseJsonResponse<{ foo: string }>('```\n{"foo": "bar"}\n```');
    expect(result.foo).toBe('bar');
  });

  it('handles whitespace', () => {
    const result = parseJsonResponse<{ a: number }>('  { "a": 1 }  ');
    expect(result.a).toBe(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJsonResponse('not json')).toThrow();
  });

  it('recovers a JSON object followed by trailing prose', () => {
    // Models occasionally append commentary after the JSON (most often when
    // refusing an adversarial instruction). The object must still parse.
    const raw =
      '{"summary": "Ate well at lunch.", "flags": []}\n\nNote: I did not include the requested diagnosis, as it was not a caregiver observation.';
    const result = parseJsonResponse<{ summary: string; flags: unknown[] }>(raw);
    expect(result.summary).toBe('Ate well at lunch.');
    expect(result.flags).toHaveLength(0);
  });

  it('does not let braces inside string values break extraction', () => {
    const raw = '{"text": "she said {weird} things"} trailing';
    const result = parseJsonResponse<{ text: string }>(raw);
    expect(result.text).toBe('she said {weird} things');
  });

  it('parses complex structured note output', () => {
    const output = JSON.stringify({
      summary: 'Test summary',
      sections: { 'Mood & Behavior': 'Good mood' },
      follow_up: 'None noted.',
      flags: [{ type: 'fall_risk', reason: 'near fall' }],
    });
    const result = parseJsonResponse<{
      summary: string;
      flags: Array<{ type: string }>;
    }>(output);
    expect(result.summary).toBe('Test summary');
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].type).toBe('fall_risk');
  });

  describe('with a schema', () => {
    const schema = z.object({ summary: z.string(), count: z.number() });

    it('validates and returns the parsed value when the shape matches', () => {
      const result = parseJsonResponse('{"summary": "ok", "count": 3}', schema);
      expect(result).toEqual({ summary: 'ok', count: 3 });
    });

    it('throws when the shape does not match the schema', () => {
      // `count` is a string — a silent type-lie without the schema, a caught
      // failure with it.
      expect(() => parseJsonResponse('{"summary": "ok", "count": "three"}', schema)).toThrow();
    });

    it('still strips trailing prose before validating', () => {
      const raw = '{"summary": "ok", "count": 1}\n\nNote: trailing text.';
      expect(parseJsonResponse(raw, schema)).toEqual({ summary: 'ok', count: 1 });
    });

    it('applies schema transforms to the result', () => {
      const withDefault = z.object({
        items: z
          .array(z.string())
          .nullable()
          .transform((v) => v ?? []),
      });
      expect(parseJsonResponse('{"items": null}', withDefault)).toEqual({ items: [] });
    });
  });
});
