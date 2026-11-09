/** The face Maya makes while a tool runs, like a person at work (exported for tests). */
export function workMood(tool = '') {
  if (/^(computer_type|computer_keys|fs_write|files_make_|write_here|mail_(send|reply))/.test(tool)) return 'typing';
  if (/^(run_command|python_run|git_|github_|agent_plan)/.test(tool)) return 'building';
  if (/^(web_|files_search|fs_search|fs_list|mail_search|mail_triage|search_|screen_look|computer_look|camera_)/.test(tool)) return 'searching';
  if (/^(qa_|tests?_)/.test(tool)) return 'checking';
  return 'working';
}
