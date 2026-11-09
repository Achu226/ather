// Agent mode, code interpreter and file maker tools. ctx.services supplies python and files.
const str = (description) => ({ type: 'string', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const strings = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const powerTools = [
  {
    name: 'agent_plan',
    description: 'AGENT MODE ONLY: write the plan before starting, as 2 to 8 short concrete steps.',
    parameters: obj({ steps: strings('The steps, in order') }, ['steps']),
    run: ({ steps }) => ({ planned: steps.length }),
  },
  {
    name: 'agent_step',
    description: 'AGENT MODE ONLY: report a plan step finished (status done or failed) with a short note.',
    parameters: obj({ index: { type: 'integer', description: '0-based step number' }, status: { type: 'string', enum: ['done', 'failed'] }, note: str('What happened') }, ['index', 'status']),
    run: ({ index, status }) => ({ index, status }),
  },
  {
    name: 'python_run',
    description: 'Run Python 3 code to calculate exactly, analyse data files (CSV/Excel in the working folder, open them by file name with pandas) or draw charts with matplotlib. print() the results. The user approves before it runs. Only for real computation, data or charts: never just to print, list or format text you could write yourself.',
    confirm: true,
    parameters: obj({ code: str('Complete Python code') }, ['code']),
    run: async ({ code }, { services, conversationId }) => {
      const r = await services.python.execute(code, conversationId);
      return { ...r, images: r.images, note: r.images.length ? 'Charts were saved and are shown to the user.' : undefined };
    },
  },
  {
    name: 'python_files',
    description: 'List the files in this conversation\'s Python working folder (attached CSV/Excel files and files your code made).',
    parameters: obj({}),
    run: (_, { services, conversationId }) => ({ files: services.python.files(conversationId) }),
  },
  {
    name: 'files_make_presentation',
    description: 'Create a real PowerPoint (.pptx) file. Write good slide content: 5 to 12 slides, 3 to 6 short bullets each, optional speaker notes.',
    parameters: obj({
      title: str('Presentation title'), subtitle: str('Subtitle, e.g. name and college'),
      slides: { type: 'array', items: obj({ title: str('Slide title'), bullets: strings('Bullet points'), notes: str('Speaker notes') }, ['title', 'bullets']) },
      images: { type: 'boolean', description: 'Draw a picture on the first 5 slides (slower)' },
    }, ['title', 'slides']),
    run: (args, { services }) => services.files.presentation(args),
  },
  {
    name: 'files_make_document',
    description: 'Create a Word (.docx) document, e.g. a report, assignment or letter. Content in Markdown (headings #, bullets -, tables |, **bold**).',
    parameters: obj({ title: str('Document title'), markdown: str('Full document content in Markdown') }, ['title', 'markdown']),
    run: (args, { services }) => services.files.document(args),
  },
  {
    name: 'files_make_pdf',
    description: 'Create a PDF file from Markdown content, e.g. notes, a cheat sheet or a report.',
    parameters: obj({ title: str('Title'), markdown: str('Full content in Markdown') }, ['title', 'markdown']),
    run: (args, { services }) => services.files.pdf(args),
  },
];
