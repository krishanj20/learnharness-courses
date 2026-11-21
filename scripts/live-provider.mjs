// A scripted, loopback-only model for repeatable host transport and outage checks.
// No third-party request is made and the disposable profile owns the settings.
import { createServer } from 'node:http';
import { once } from 'node:events';

const id = 'book-course-smoke';
function logicalReply(instruction, input) {
  if (input.assigned && instruction.includes('offline book lesson')) {
    return {
      explanation: 'A security is a standardised tradable contract.',
      example: 'Compare an exchange-traded contract with a bespoke agreement.',
      checks: ['Which contract is easier to transfer?', 'What makes the new contract transferable?'].map(
        (question) => ({
          question,
          correct: 1,
          choices: [
            { label: 'Bespoke terms', feedback: 'Bespoke terms require negotiation.' },
            { label: 'Standard terms', feedback: 'Common terms facilitate transfer.' },
          ],
        }),
      ),
    };
  }
  if (Array.isArray(input.targets)) {
    const answer = input.answers.find((a) =>
      a.answer.includes('Divide the price change by the initial price'),
    );
    return {
      demonstrated: answer
        ? [
            {
              point: '1.1',
              answerIds: [answer.id],
              reason: 'Computed a simple return from the initial and final prices.',
            },
          ]
        : [],
    };
  }
  if (instruction.includes('"sections"')) {
    return {
      sections: input.sections.map((section) => {
        const source = section.pages.find((p) => p.text.trim().length > 8);
        return {
          section: section.section,
          objectives: [
            {
              skill: 'Explain ' + section.title,
              page: source.page,
              anchor: source.text.match(/^\[([^\]]+)\]/)?.[1],
              quote: source.text.trim().split(/\s+/).slice(0, 8).join(' '),
              status: 'new',
              evidence: [],
              prerequisites: [],
            },
          ],
        };
      }),
    };
  }
  if (Array.isArray(input.previousQuestions)) {
    const problems = [
      [
        'A fund rises 10% and then falls 10%. Where does 100 finish, and why?',
        '99, from 100 × 1.10 × 0.90. The second percentage applies to 110.',
      ],
      [
        'What gain restores the original value after a 20% loss? Explain using gross returns.',
        '25%, because 0.80 × 1.25 = 1.',
      ],
    ];
    const [question, rubric] = problems.find(([q]) => !input.previousQuestions.includes(q)) ?? problems[0];
    return {
      verifiable: true,
      question,
      rubric,
      check: 'Multiply the two period gross returns.',
      objectives: [input.objectives[0].id],
      fullyTested: [input.objectives[0].id],
    };
  }
  if (instruction.includes('verifiable')) {
    return {
      question: 'Which assumption does the chapter use, and what follows from it?',
      transcription:
        input.exercise?.id === '2.1'
          ? 'Show that the compounded return is no greater than the arithmetic mean return.'
          : undefined,
      rubric: 'Explain the assumption and its consequence.',
      check: 'Apply the reasoning to a second example.',
      objectives: input.objectives.map((o) => o.id),
      fullyTested: input.objectives.map((o) => o.id),
      testedSkill: 'Identify the source assumption and predict the resulting change.',
      verifiable: true,
    };
  }
  if (instruction.includes('"solved"')) {
    const answer = input.history?.filter((m) => m.role === 'learner').at(-1)?.text || '';
    const guided = input.helpRequested || answer.includes('I need a smaller step');
    return {
      reply: guided
        ? 'What does the first observation tell you?'
        : 'Your argument establishes the conclusion.',
      solved: !guided,
      assisted: guided,
    };
  }
  return {
    reply: 'What can you infer from the first example in this section?',
    demonstrated: (input.objectives || []).map((o) => o.id),
  };
}
export async function startFixture() {
  const requests = [];
  const visualExamExercises = [];
  let connected = true;
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/v1/models')
        return res.end(
          JSON.stringify({ object: 'list', data: [{ id, input_modalities: ['text', 'image'] }] }),
        );
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404);
        return res.end();
      }
      if (!connected) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: { message: 'Disconnected in the desktop scenario' } }));
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const instruction =
        body.messages.find((m) => m.role === 'system' || m.role === 'developer')?.content || '';
      const prompt = body.messages.find((m) => m.role === 'user')?.content;
      const hasCourse = body.tools?.some((t) => t.function.name === 'course_reading');
      let delta, finish;
      const graphPilot = process.argv.includes('--graph-pilot');
      const toolCall = (name, args) => ({
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: 'graph-' + name,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      const statement =
        'A baseline supplies the reference value against which a new measurement is compared.';
      const hasTool = (name) => body.tools?.some((t) => t.function.name === name);
      if (graphPilot && hasTool('submit_findings')) {
        const match = /TEACHER \[([^\]]+)\] [^\n]*A baseline supplies/.exec(
          typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
        );
        delta = toolCall('submit_findings', {
          propositions: match
            ? [{ id: 'p1', name: 'Measurement baseline', statement, messageId: match[1] }]
            : [],
          chains: [],
        });
        finish = 'tool_calls';
      } else if (graphPilot && hasTool('submit_review')) {
        delta = toolCall('submit_review', { links: [] });
        finish = 'tool_calls';
      } else if (hasCourse) {
        const sourceResult = body.messages.find(
          (m) => m.role === 'tool' && JSON.stringify(m.content).includes('chapterMap'),
        );
        const opening = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
        const definitions = opening.includes('Teach me “Definitions”');
        const garch = opening.includes('Teach me “GARCH(1, 1) and Return Stylized Facts”');
        const excess = opening.includes('Teach me “Excess Returns”');
        const pageRequested = body.messages.some((m) =>
          m.tool_calls?.some((t) => t.function.name === 'course_page'),
        );
        const pageVisible = body.messages.some(
          (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url'),
        );
        const answered = body.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'native-probe');
        if (
          graphPilot &&
          answered &&
          !body.messages.some((m) => m.tool_call_id === 'graph-course_finish_lesson')
        ) {
          delta = toolCall('course_finish_lesson', {});
          finish = 'tool_calls';
        } else if (answered) {
          delta = {
            role: 'assistant',
            content: graphPilot ? statement : 'Return to Courses to check your progress.',
          };
          finish = 'stop';
        } else {
          const name = !sourceResult
            ? 'course_reading'
            : definitions && !pageRequested
              ? 'course_page'
              : 'probe';
          const correct = graphPilot
            ? 'Reference measurement'
            : definitions
              ? 'Ten percent'
              : excess
                ? 'Two percentage points'
                : garch
                  ? 'The last squared shock and conditional variance'
                  : 'Portable claim';
          const question = graphPilot
            ? 'What does a baseline provide?'
            : garch
              ? 'Which information determines next period’s variance in GARCH(1, 1)?'
              : definitions
                ? 'On PDF p. 59, what is the simple return when the price rises from 100 to 110?'
                : excess
                  ? 'How much did a portfolio earning 5% outperform a 3% benchmark?'
                  : 'Which feature lets a security change hands?';
          const args =
            name === 'course_page'
              ? { page: 59 }
              : name === 'probe'
                ? {
                    question,
                    options: [
                      { label: correct },
                      {
                        label: graphPilot
                          ? 'Final measurement'
                          : definitions
                            ? 'One percent'
                            : excess
                              ? 'Eight percentage points'
                              : 'Fixed owner',
                      },
                    ],
                    correctAnswer: correct,
                    explanation: graphPilot
                      ? statement
                      : definitions
                        ? 'Divide the gain by the original price.'
                        : excess
                          ? 'Subtract the benchmark from the portfolio return.'
                          : 'The claim can pass to another holder.',
                  }
                : {};
          delta = {
            role: 'assistant',
            ...(excess && name === 'probe'
              ? {
                  content:
                    'Subtract the benchmark from the portfolio return. The answer is two percentage points.',
                }
              : {}),
            tool_calls: [
              {
                index: 0,
                id: 'native-' + name,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          };
          finish = 'tool_calls';
        }
        requests.push({
          native: true,
          sourceRead: !!sourceResult,
          definitions,
          sourceInOpening: opening.includes('PDF p. 59') && opening.includes('ri(1)'),
          pageRequested,
          pageVisible,
        });
      } else {
        const rawInput = typeof prompt === 'string' ? prompt : prompt?.find((x) => x.type === 'text')?.text;
        let input;
        try {
          input = JSON.parse(rawInput);
        } catch {
          input = {};
        }
        requests.push(input);
        if (input.exercise?.id && Array.isArray(prompt) && prompt.some((part) => part.type === 'image_url'))
          visualExamExercises.push(input.exercise.id);
        delta = { role: 'assistant', content: JSON.stringify(logicalReply(instruction, input)) };
        finish = 'stop';
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      for (const [part, finish_reason] of [
        [delta, null],
        [{}, finish],
      ]) {
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'course-test-' + requests.length,
              model: id,
              object: 'chat.completion.chunk',
              created: 1,
              choices: [{ index: 0, delta: part, finish_reason }],
            }) +
            '\n\n',
        );
      }
      res.end('data: [DONE]\n\n');
    } catch (error) {
      console.error('Scripted provider:', error.message);
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = 'http://127.0.0.1:' + server.address().port + '/v1';
  return {
    requests,
    visualExamExercises,
    setConnected(value) {
      connected = value;
    },
    close() {
      server.closeAllConnections();
      server.close();
    },
    settings: {
      version: 1,
      customProvider: { baseUrl, models: [{ id, image: true }], authMode: 'keyless' },
      models: {
        strong: { model: { provider: 'custom', id } },
        ...(process.argv.includes('--graph-pilot') ? { cheap: { model: { provider: 'custom', id } } } : {}),
      },
    },
  };
}
