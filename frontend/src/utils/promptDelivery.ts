/**
 * How a large text prompt reaches a provider.
 *
 * Gemini's composer silently truncates very large pasted prompts. That is
 * especially destructive here because every one of our prompts puts the
 * output-format contract (the ---JSON-START--- / ---JSON-END--- delimiters) at
 * the very END, so a truncated send does not degrade gracefully: the model
 * never sees the contract and replies with freeform prose that no parser can
 * read. The fix already used for the council judge is to deliver the whole task
 * as a .txt attachment plus a short cover instruction; this module generalizes
 * that so every large-prompt send shares one code path.
 *
 * The attach path is best-effort. Gemini's hidden-tab upload UI is flaky, so a
 * failure falls back to a plain paste, which is strictly no worse than the old
 * behavior.
 */
import type { AiProvider } from './aiProviders';

export interface LargePromptSenders<TResponse> {
  sendPromptAndWait: (args: {
    provider: AiProvider;
    prompt: string;
    incognito?: boolean;
  }) => Promise<TResponse>;
  sendPromptAsFileAndWait: (args: {
    provider: AiProvider;
    coverPrompt: string;
    fileText: string;
    filename: string;
    forceNewChat?: boolean;
    incognito?: boolean;
  }) => Promise<TResponse>;
}

/**
 * Providers whose composer cannot be trusted with a very large pasted prompt.
 * Kept as a predicate rather than an inline `=== 'gemini'` so the next provider
 * that develops the same problem is a one-line change here.
 */
export function providerTruncatesLargePrompts(provider: AiProvider): boolean {
  return provider === 'gemini';
}

/**
 * Send a large prompt, attaching it as a file for providers that truncate.
 * Everything else gets the ordinary paste path unchanged.
 */
export async function sendLargePromptAndWait<TResponse>({
  provider,
  prompt,
  coverPrompt,
  filename,
  incognito,
  senders,
  onAttachFailed,
}: {
  provider: AiProvider;
  prompt: string;
  /** Short instruction sent alongside the attachment. */
  coverPrompt: string;
  /** Attachment filename, e.g. "resume-task.txt". */
  filename: string;
  incognito?: boolean;
  senders: LargePromptSenders<TResponse>;
  /**
   * Called when the attach path fails and we are about to paste instead.
   * Pasting a prompt this large into a truncating provider silently produces a
   * decapitated task, so the caller MUST surface this rather than let the run
   * look healthy. The extension's error text is specific (missing "+" button,
   * no fileChooserOpened, debugger unavailable, temp-file write failed), so
   * pass it through verbatim.
   */
  onAttachFailed?: (message: string) => void;
}): Promise<TResponse> {
  if (providerTruncatesLargePrompts(provider)) {
    try {
      return await senders.sendPromptAsFileAndWait({
        provider,
        coverPrompt,
        fileText: prompt,
        filename,
        incognito,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Never swallow this. An earlier version caught it silently, which turned
      // a diagnosable attach failure into an unexplained truncated resume.
      console.warn(
        `[promptDelivery] ${provider} file attach failed, pasting ${prompt.length} chars ` +
          `(truncation likely): ${message}`,
      );
      onAttachFailed?.(message);
    }
  }

  return senders.sendPromptAndWait({ provider, prompt, incognito });
}
