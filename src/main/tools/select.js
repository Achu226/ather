// Give the model only the tools a request can need: ~60 tool descriptions confuse small models into
// printing tool JSON instead of answering. Agent mode still gets everything.
const ALWAYS = ['memory_save', 'web_search', 'tasks_create', 'reminders_create', 'notes_create', 'app_undo', 'history_query'];

const GROUPS = [
  // People and feelings
  [/\b(whats ?app|message (to )?\w+|text (to )?\w+|call\b|ring|phone|contacts?|number of|save .* number)/i, /^(contacts_|call_contact|whatsapp_message)/],
  [/\b(diary|journal|dear diary|how was my (week|day|month)|what did i write|i feel|i'?m feeling|my mood)/i, /^diary_/],
  // Camera eyes and interpreter (for people who cannot see well, or talk to someone in another language)
  [/\b(in front of me|am i holding|camera|webcam|look at (this|it|me)|what(?:'s| is) this (in my hand|thing)|read (this|the|my) (paper|letter|label|page|text|bill|card|book|note|notice|prescription|tablet|medicine)|what colou?r is)/i, /^camera_/],
  [/\b(interpret(er)?|translate (my|our|the) (conversation|talk)|talk to (him|her|them) in|translate what (he|she|they) say)/i, /^interpreter$/],
  // Everyday voice actions (as on heynixi.app)
  [/\b(where (is|are|'s|do i)|show me where|point (to|at)|how do i find the)\b/i, /^(screen_point|screen_look)$/],
  [/^\s*(please\s+|can you\s+)?(write|draft|compose)\b|\bwrite (a|an|the|my|me a) .*(reply|e-?mail|mail|note|message|post|letter|caption|tweet|comment)/i, /^write_here$/],
  [/\b(tele ?prompter|prompter)\b/i, /^teleprompter$/],
  [/\b(timer|countdown)\b/i, /^timer_/],
  [/\b(lists?|shopping|grocer(y|ies)|i bought|buy)\b/i, /^list_/],
  [/\b(dark|light|night) (mode|theme)\b/i, /^pc_dark_mode$/],
  [/\b(play|put on|listen to)\b/i, /^music_play$/],
  [/\b(task|to-?do|remind|reminder|note|habit|focus|pomodoro|calendar|event|schedule|meeting|class|exam|deadline|due|undo|plan my|did i|productive|streak)/i,
    /^(tasks_|notes_|reminders_|habits_|focus_|calendar_|history_|app_undo)/],
  [/\b(open|launch|start|close|quit|volume|louder|quieter|mute|brightness|lock|shutdown|shut down|(turn|switch|power) (off|down)|reboot|restart|sleep|play|pause|next song|previous|music|song|routine|mode|wifi|bluetooth|settings|screen time|spent|youtube|instagram|activity|apps? i used)/i,
    /^(pc_|routines_|activity_|focus_)/],
  [/\b(search|google|latest|news|today|current|price|weather|who won|score|website|web ?page|link|https?:|url|open .*\.com|read this page)/i, /^(web_|open_website)/],
  [/\b(find|search|where is|locate) (my|the)|\b(my )?(files?|photos?|pictures?|folder|documents?) (of|about|from|with|named)/i, /^(files_search|open_file)/],
  [/\b(draw|image|picture|photo|illustration|blur|background|upscale|sharper|generate an?)/i, /^images_/],
  [/\b(quiz|flashcards?|revise|revision|study set|test me|practice questions)/i, /^study_/],
  [/\b(calculate|compute|plot|graph|chart|python|csv|excel|spreadsheet|statistics|average|run (this|the) code)/i, /^python_/],
  [/\b(ppt|powerpoint|presentation|slides?|word (doc|file)|docx|pdf|report|assignment|document|letter)\b/i, /^files_make_/],
  // An email address in the request ("write to rahul@…") means email, whatever the verb.
  [/\b(e-?mail|inbox|mail|repl(y|ied|ies)|follow ?up|newsletters?|promotions?|unsubscribe)|[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /^mail_/],
  [/\b(work timer|work (on .{1,40} )?for \d|work session|shut ?down (the |my )?(pc |computer |laptop )?(after|in|at|when)|(after|then|later)\b.{0,15}shut ?down)/i, /^work_timer_/],
  [/\b(ask|in|on|to|use) (chat ?gpt|gpt|claude)\b|\b(chat ?gpt|claude)\b/i, /^ai_ask$/],
  [/\b(skills?|teach (yourself|you)|when i say|learn (to|this|how))\b/i, /^skills_/],
  [/\b(snippets?|save my [\w ]{2,25} as|type my)\b/i, /^snippets_save$/],
  // "Every morning at 8, read my emails and today's tasks": a daily routine.
  [/\b(every (day|morning|evening|night|weekday|afternoon)|each (morning|day|evening)|daily at|routines?)\b/i, /^(routines_|briefing_now)/],
  [/\b(text|font|letters?|theme|dark|light|colou?r|bigger|smaller|compact|hide|show .{1,20}page|page|large mode|high contrast|sidebar)\b/i, /^ui_set$/],
  [/\b(your name|call you|call me|rename you|rule|always (answer|reply|speak|talk)|my goals?|(talk|speak)\b.{0,15}\b(slower|faster|slowly|quickly)|slow(er)? down|speed up|voice|sound like|chrome profile|use my .{1,15} chrome)\b/i, /^persona_set$/],
  [/\b(what (are|were) you doing|what did you do|what have you done|did (it|that) work|your (work|progress)|என்ன செய்(கிறாய்|தாய்))/i, /^monitor_status$/],
  [/\b(mishear|hear(s|d)? .{1,30} (when|instead)|spell(ed|t|ing)? |you keep (hearing|writing)|not .{1,20}, it'?s )/i, /^learn_word$/],
  [/\b(weekly report|week'?s report|report (of|for|on) (my|this|the) week|my week)\b/i, /^report_/],
  [/\b(screen|what am i looking at|this window|on my monitor)/i, /^screen_look$/],
  [/\b(remember|forget|what do you know about me|my name|about me)/i, /^memory_/],
  [/\b(personality|talk like|voice|act like|be more)/i, /^personality_set$/],
  [/\b(briefing|brief me|my day|plan for today|summary of today)/i, /^briefing_now$/],
  [/\b(animation|wave|celebrate|dance)/i, /^animations_play$/],
  [/\b(files?|folders?|downloads|desktop|documents folder|organi[sz]e|tidy|clean ?up|rename|move .* to|recycle bin|delete (the|this|that|my) )/i, /^fs_/],
  [/\b(git|commit|diff|branch|uncommitted|changes in (my|the) (project|code|repo))/i, /^git_/],
  [/\b(database|sqlite|\.db\b|\bsql\b|tables? in)/i, /^db_/],
  [/\b(what time|time in|timezone|time zone|convert .* time|how long until|how many days|countdown|days (left|until))/i, /^time_/],
  [/\b(run|npm|pip|pytest|build|compile|tests?|fix (the|this|my) (bug|code|error)|bug in|my project|codebase|refactor)\b/i, /^(run_command|fs_|git_)/],
  [/\b(timetable|time table|class(es)?|lecture timings|periods?|exams?|mid-?sems?|end-?sems?|days (left|until)|countdown)\b/i, /^(timetable_|exams_|calendar_query)/],
  [/\b(cpu|ram|memory usage|battery|gpu|graphics card|disk space|storage (left|space)|temperature|system status|how is my (pc|laptop|computer)|(pc|laptop|computer) (is )?(slow|hot|lagging))/i, /^system_status$/],
  [/\b(i cop(y|ied)|copied|clipboard|paste (the|that|what))/i, /^clipboard_/],
  [/\b(water|hydrat|eye breaks?|20-20-20|posture|stretch|health (break|reminder)s?)/i, /^health_/],
  [/\b(head mouse|hands?-free|without (a |the )?mouse|can'?t use (a |the |my )?mouse|move the (cursor|mouse) with my head|head (control|tracking))/i, /^head_mouse$/],
  [/\b(captions?|subtitles?|translate (this|the) (video|audio|call|class)|what (are|is) they saying)/i, /^captions_/],
  [/\b((in|on|into) (whatsapp|notepad|word|excel|telegram|teams|outlook|paint|settings|chrome|edge|google|youtube|gmail|the app|the browser|this (app|window|page))|type (?!of\b)\S|write .+ (in|into|on) |click\b|select\b|open .+ (and|then) (type|search|write|click|send|play)|fill (in|out|this)|(message|text|whatsapp) \w+|send (a|the|my)? ?message|(take )?control (of )?(my|the) (pc|computer|laptop)|use my (pc|computer|laptop)|do it for me|go to|scroll (up|down)|press (enter|the|ctrl)|(search|look up) .* (in|on) (chrome|google|youtube|edge))/i, /^computer_/],
];

/** Tools for this request: a few always, plus groups whose keywords appear in this or the previous user message. */
export function selectTools(tools, text, { agent = false, previous = '', images = 0 } = {}) {
  if (agent) return tools;
  const haystack = `${text}\n${previous}`;
  const patterns = GROUPS.filter(([words]) => words.test(haystack)).map(([, names]) => names);
  if (images) patterns.push(/^images_/);
  // MCP tools carry their server's keywords; only servers relevant to this request are loaded.
  return tools.filter((t) => ALWAYS.includes(t.name) || patterns.some((p) => p.test(t.name)) || t.keywords?.test(haystack));
}
