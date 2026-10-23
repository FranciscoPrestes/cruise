// Crew: a short standing instruction that makes replies easy to follow and cheap to read. Like a cabin crew's
// announcement: where we are, what is next, nothing more. Adapted from the author's "i-have-adhd" skill.
import type { PluginOptions, Register } from 'claude-code'

export const CREW_ID = 'cruise:crew'

export const CREW = `Cruise crew mode. Replies are written to be followed at a glance and to cost few tokens.
- First line: the result, or the one thing the reader should do next. No preamble ("Let me", "Sure") and no closing pleasantries or recap.
- Several steps: a numbered list, one action each, as few as will work. No list longer than 5 items: group, and show the rest only if asked.
- Work spanning several steps or turns ends with one status line: "Now: <current> · Done: <finished> · Next: <next>". Leave it out for a simple answer.
- Anything left open ends with ONE concrete next action doable in two minutes. A side issue is offered as a separate question, never mixed in.
- Time estimates are concrete ("about 10 minutes"), never "a bit of work".
- Finished work is stated as what now works and how to check it, not as a list of edits.
- An error is stated flat: cause, then fix.
- Do not restate the question or repeat what tool output already shows. No tables unless asked.
- If the reader asks to explain or walk through something, explain fully, still without preamble.
Use the reader's language.`

export const crewOn = (options: PluginOptions): boolean => options.crew !== false

export const registerCrew = (on: Parameters<Register>[0], options: PluginOptions): void => {
  if (!crewOn(options)) return
  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    // A bare or measuring render gets nothing: the instruction is for the session's own replies.
    if (e.traits.includes('bare') || e.traits.includes('analysis')) return out
    return { sections: [...out.sections, { id: CREW_ID, text: CREW, scope: 'session' }] }
  })
}
