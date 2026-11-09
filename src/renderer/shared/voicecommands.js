// Voice-only control (for people who cannot use a keyboard or mouse): direct spoken commands run at once,
// without the AI, like Windows Voice Access. Everything else goes to Maya as a normal question.

const WORDS = { one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const num = (s) => (/^\d+$/.test(s) ? Number(s) : WORDS[s] ?? null);
const KEYS = { enter: 'enter', return: 'enter', tab: 'tab', escape: 'esc', esc: 'esc', backspace: 'backspace', delete: 'delete', space: 'space',
  up: 'up', down: 'down', left: 'left', right: 'right', home: 'home', end: 'end', 'page up': 'pageup', 'page down': 'pagedown' };
const SHORTCUTS = {
  'go back': 'alt+left', 'go forward': 'alt+right', 'new tab': 'ctrl+t', 'close tab': 'ctrl+w', 'switch window': 'alt+tab', 'next window': 'alt+tab',
  'select all': 'ctrl+a', copy: 'ctrl+c', paste: 'ctrl+v', cut: 'ctrl+x', undo: 'ctrl+z', redo: 'ctrl+y', save: 'ctrl+s', refresh: 'f5', 'reload page': 'f5',
  'zoom in': 'ctrl+=', 'zoom out': 'ctrl+-', 'find on page': 'ctrl+f',
};

/** Spoken yes / no for approval cards, in English and Tamil. null when it is neither. */
export function parseYesNo(text) {
  const t = text.toLowerCase().replace(/[.,!?]/g, ' ').trim();
  if (/^(no|nope|nah|cancel|stop|don'?t|do not|deny|wait)\b|வேண்டாம்|வேணாம்|இல்லை|வேண்டா/.test(t)) return false;
  if (/^(yes|yeah|yep|yup|sure|ok|okay|allow|go ahead|do it|run it|fine|alright|correct)\b|ஆம்|ஆமா|சரி|செய்|பண்ணு|ஓகே/.test(t)) return true;
  return null;
}

/**
 * A direct command, or null when the words are a question for Maya.
 * { cmd: 'sos' | 'cancel' | 'later' | 'magnify' | 'readdoc' | 'page' | 'read' | 'keyboard' | 'scan' | 'switch' | 'numbers' | 'grid' | 'hide' | 'click' | 'cell' | 'scroll' | 'keys' | 'type', … }
 */
export function parseCommand(text) {
  const t = text.toLowerCase().replace(/[“”"]/g, '').replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ').trim();
  // Emergency: only these exact words, so "help me with my homework" never sets off an alarm.
  if (/^(help|help me|help me please|please help( me)?|emergency|it'?s an emergency|call for help|sos)$|^(உதவி|உதவி செய்|காப்பாத்து(ங்க)?|காப்பாற்று(ங்கள்)?)$/.test(t)) return { cmd: 'sos' };
  if (/^(cancel|stop|i'?m (ok|okay|fine)|no|false alarm)$|^(வேண்டாம்|பரவாயில்லை|நான் நலம்)$/.test(t)) return { cmd: 'cancel' };
  // What is under the mouse / head pointer (low vision).
  if (/^(what('?s| is) (this|that|under the (mouse|pointer|cursor))|what am i pointing at|read (this|that) (button|link|thing))$|^(இது என்ன|இது என்னது)$/.test(t)) return { cmd: 'whatis' };
  // Repeat the last command ("scroll down… again… again").
  if (/^(again|do (it|that) again|repeat (that|the last) command|one more time|மறுபடி செய்)$/.test(t)) return { cmd: 'again' };
  // Drag by voice: between two numbers, or two grid cells.
  let d = t.match(/^(?:drag|move|drag and drop) (?:number )?(\w+) (?:to|onto|into) (?:number )?(\w+)$/);
  if (d && num(d[1]) && num(d[2])) return { cmd: 'drag', from: num(d[1]), to: num(d[2]) };
  d = t.match(/^(?:drag|move|drag and drop) ([a-p]) ?(10|[1-9]) (?:to|onto|into) ([a-p]) ?(10|[1-9])$/);
  if (d) return { cmd: 'drag', fromCell: `${d[1].toUpperCase()}${d[2]}`, toCell: `${d[3].toUpperCase()}${d[4]}` };
  // Teaching Maya by voice: was that answer good?
  if (/^(good|great|nice|perfect|excellent) (answer|job|reply)$|^that was (good|great|helpful|perfect)$|^(நல்ல பதில்|சூப்பர்)$/.test(t)) return { cmd: 'feedback', good: true };
  if (/^(bad|wrong|poor) (answer|reply)$|^that'?s (wrong|not right|not what i (wanted|asked))$|^that was (bad|wrong|not helpful)$|^(தவறு|தப்பு|தப்பான பதில்)$/.test(t)) return { cmd: 'feedback', good: false };
  // The shutdown countdown after a work timer: more time instead of shutting down.
  if (/^(wait|not yet|hold on|i'?m still working|keep working|give me (15|fifteen) (more )?minutes)$|^(இரு|இன்னும் வேலை இருக்கு|பொறு)$/.test(t)) return { cmd: 'later' };
  // Windows Magnifier (low vision, or a screen far from the bed or wheelchair).
  if (/^(start|open|turn on) (the )?magnifier$|^magnif(y|y more|ier on)$|^பெரிதாக்கு$/.test(t)) return { cmd: 'magnify', action: 'in' };
  if (/^magnify less$|^சிறிதாக்கு$/.test(t)) return { cmd: 'magnify', action: 'out' };
  if (/^(stop|close|turn off) (the )?magnifier$|^magnifier off$/.test(t)) return { cmd: 'magnify', action: 'off' };
  if (/^magnifier (lens|full ?screen|docked)$/.test(t)) return { cmd: 'magnify', action: t.split(' ')[1].replace(' ', '') };
  // Reading a document page by page.
  let m = t.match(/^read (?:my |the )?(?:document|file|pdf|notes?|book) (?:called |named )?(.+)$/);
  if (m) return { cmd: 'readdoc', name: m[1] };
  if (/^next page$|^அடுத்த பக்கம்$/.test(t)) return { cmd: 'page', go: 'next' };
  if (/^(previous|last|go back a) page$|^முந்தைய பக்கம்$/.test(t)) return { cmd: 'page', go: 'previous' };
  if (/^(repeat|repeat (that|the page)|read (that |it )?again)$|^(மீண்டும்|மறுபடியும்)$/.test(t)) return { cmd: 'page', go: 'repeat' };
  if (/^stop reading$|^படிப்பதை நிறுத்து$/.test(t)) return { cmd: 'page', go: 'stop' };
  m = t.match(/^(?:go to )?page (\w+)$/);
  if (m && num(m[1])) return { cmd: 'page', go: num(m[1]) };
  if (/^(read|read (this|it|that|the screen|the page|this page|my screen|aloud|it aloud|this aloud))$|^(படி|திரையை படி|இதை படி|வாசி)$/.test(t)) return { cmd: 'read' };
  if (/^(open|show|start) (the )?(on-?screen )?keyboard$|^கீபோர்டு (திற|காட்டு)$/.test(t)) return { cmd: 'keyboard', on: true };
  if (/^(close|hide|stop) (the )?(on-?screen )?keyboard$|^கீபோர்டு (மூடு|மறை)$/.test(t)) return { cmd: 'keyboard', on: false };
  if (/^(start|begin) scanning$/.test(t)) return { cmd: 'scan', on: true };
  if (/^stop scanning$/.test(t)) return { cmd: 'scan', on: false };
  if (/^(select|pick|this one|choose)$|^(இது|இதை)$/.test(t)) return { cmd: 'switch' };
  if (/^(delete|remove) (the )?last word$|^கடைசி வார்த்தையை (அழி|நீக்கு)$/.test(t)) return { cmd: 'keys', keys: 'ctrl+backspace' };
  if (/^(delete|remove) (that|this|it)$|^(அழி|நீக்கு)$/.test(t)) return { cmd: 'keys', keys: 'backspace' };
  if (/^new line$|^புது வரி$/.test(t)) return { cmd: 'keys', keys: 'shift+enter' };
  if (/^(show|display) (the )?(numbers|labels|tags)$|^எண்(கள்|களை)? காட்டு/.test(t)) return { cmd: 'numbers' };
  if (/^(show|display) (the )?grid$|^கட்டம் காட்டு/.test(t)) return { cmd: 'grid' };
  if (/^(hide|remove|clear) (the )?(numbers|labels|grid|overlay)$|^hide$|^மறை/.test(t)) return { cmd: 'hide' };

  m = t.match(/^(double |right )?(click|press|tap|select|open) (on )?(number )?(\w+)$/);
  if (m && num(m[5]) !== null) return { cmd: 'click', n: num(m[5]), double: m[1] === 'double ', right: m[1] === 'right ' };
  m = t.match(/^(double |right )?(click|tap) (on )?(cell |square )?([a-p]) ?(10|[1-9]|\w+)$/);
  if (m && num(m[6]) >= 1 && num(m[6]) <= 10) return { cmd: 'cell', cell: `${m[5].toUpperCase()}${num(m[6])}`, double: m[1] === 'double ', right: m[1] === 'right ' };

  m = t.match(/^scroll (up|down)( a lot| more)?$/);
  if (m) return { cmd: 'scroll', direction: m[1], amount: m[2] ? 15 : 5 };
  if (/^(கீழே|கீழ) (போ|ஸ்க்ரோல்)/.test(t)) return { cmd: 'scroll', direction: 'down', amount: 5 };
  if (/^(மேலே|மேல) (போ|ஸ்க்ரோல்)/.test(t)) return { cmd: 'scroll', direction: 'up', amount: 5 };

  m = t.match(/^press (.+)$/);
  if (m) {
    const k = m[1].replace(/^the /, '').replace(/ key$/, '');
    if (KEYS[k]) return { cmd: 'keys', keys: KEYS[k] };
    const combo = k.replace(/\bcontrol\b/g, 'ctrl').replace(/\bwindows\b/g, 'win').split(/ (?:plus |\+ )?|\+/).filter(Boolean);
    if (combo.length >= 2 && /^(ctrl|alt|shift|win)$/.test(combo[0])) return { cmd: 'keys', keys: combo.join('+') };
  }
  if (SHORTCUTS[t]) return { cmd: 'keys', keys: SHORTCUTS[t] };
  if (/^minimi[sz]e( (this|the) window)?$/.test(t)) return { cmd: 'minimize' };

  // "write a letter…" and "type of animals…" are questions for Maya, not text to type.
  m = text.trim().match(/^(?:type(?!\s+of\b)|dictate|டைப் பண்ணு|எழுது)[:,]?\s+(.+)$/i);
  if (m) return { cmd: 'type', text: m[1].replace(/[.]$/, '') };
  return null;
}
