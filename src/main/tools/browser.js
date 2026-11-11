// Maya's own browser (services/browser.js): websites by numbered elements, signed in once by the user.
import { needsApproval } from '../services/browser.js';

const str = (description) => ({ type: 'string', description });
const int = (description) => ({ type: 'integer', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export const browserTools = [
  {
    name: 'browser_open',
    description: 'Open a website in Maya\'s own browser (where the user is signed in to their sites) and read it: title, text and numbered links, buttons and fields. Use it to do things ON a website: check a college portal, read Gmail on the web, fill a form, search a shop.',
    parameters: obj({ url: str('Web address, e.g. gmail.com or https://…') }, ['url']),
    run: ({ url }, { services }) => services.browser.open(url),
  },
  {
    name: 'browser_read',
    description: 'Read the page now open in Maya\'s browser again (after it changed).',
    parameters: obj({}),
    run: (_, { services }) => services.browser.read(),
  },
  {
    name: 'browser_click',
    description: 'Click a link or button in Maya\'s browser by its number from browser_open/browser_read. Sending, buying, posting or deleting asks the user first.',
    parameters: obj({ number: int('Element number') }, ['number']),
    run: async ({ number }, { services }) => {
      const it = services.browser.item(number);
      if (!it) return { error: `There is no element ${number}. Read the page first (browser_read).` };
      if (needsApproval(it)) {
        const site = (await services.browser.read()).url?.replace(/^https?:\/\/([^/]+).*/, '$1');
        const ok = await services.confirm?.({ name: 'browser_click', args: { label: it.label || `element ${number}`, site } });
        if (!ok) return { denied: true, message: 'The user did not allow this click. Do not retry it; ask what they want instead.' };
      }
      return services.browser.click(number);
    },
  },
  {
    name: 'browser_type',
    description: 'Type into a field in Maya\'s browser by its number (replaces what is in it). submit=true presses Enter after (search boxes). Never for passwords: the user types those.',
    parameters: obj({ number: int('Field number'), text: str('What to type'), submit: { type: 'boolean', description: 'Press Enter after typing' } }, ['number', 'text']),
    run: ({ number, text, submit }, { services }) => services.browser.type(number, text, { submit: !!submit }),
  },
  {
    name: 'browser_back',
    description: 'Go back one page in Maya\'s browser.',
    parameters: obj({}),
    run: (_, { services }) => services.browser.back(),
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page in Maya\'s browser to see more.',
    parameters: obj({ direction: { type: 'string', enum: ['up', 'down'] } }),
    run: ({ direction = 'down' }, { services }) => services.browser.scroll(direction),
  },
];
