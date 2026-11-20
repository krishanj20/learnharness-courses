// A scripted, loopback-only model for repeatable host transport and outage checks.
// No third-party request is made and the disposable profile owns the settings.
import { createServer } from 'node:http';
import { once } from 'node:events';

const id = 'book-course-smoke';
function logicalReply(instruction, input) {
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
    const guided = answer.includes('I need a smaller step');
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
        return res.end(
          JSON.stringify({ error: { message: 'Disconnected in the desktop scenario' } }),
        );
      }
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const instruction =
        body.messages.find((m) => m.role === 'system' || m.role === 'developer')?.content || '';
      const prompt = body.messages.find((m) => m.role === 'user')?.content;
      const input = JSON.parse(
        typeof prompt === 'string' ? prompt : prompt.find((x) => x.type === 'text').text,
      );
      requests.push(input);
      if (
        input.exercise?.id &&
        Array.isArray(prompt) &&
        prompt.some((part) => part.type === 'image_url')
      )
        visualExamExercises.push(input.exercise.id);
      const result = logicalReply(instruction, input);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      for (const [delta, finish_reason] of [
        [{ role: 'assistant', content: JSON.stringify(result) }, null],
        [{}, 'stop'],
      ]) {
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'course-test-' + requests.length,
              model: id,
              object: 'chat.completion.chunk',
              created: 1,
              choices: [{ index: 0, delta, finish_reason }],
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
      models: { strong: { model: { provider: 'custom', id } } },
    },
  };
}
