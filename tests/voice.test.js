const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('const BaccproVoice = (() => {');
const finish = html.indexOf('function renderExplication(q){', begin);
assert.ok(begin >= 0 && finish > begin, 'voice module is embedded before renderExplication');
const voiceSource = html.slice(begin, finish);

function environment({ voices = [], native = null, online = true } = {}) {
  const spoken = [];
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const el = { id, value: '', disabled: false, checked: false, textContent: '', style: {}, classList: { toggle() {} } };
      Object.defineProperty(el, 'innerHTML', { set(value) { this._html = value; const m = String(value).match(/<option value="([^"]+)"/); if (m && !this.value) this.value = m[1]; }, get() { return this._html || ''; } });
      elements.set(id, el);
    }
    return elements.get(id);
  }
  class Utterance { constructor(text) { this.text = text; this.rate = 1; } }
  const synth = { getVoices: () => voices, addEventListener() {}, cancel() { this.cancelCount = (this.cancelCount || 0) + 1; }, speak(item) { spoken.push(item); } };
  const storage = new Map();
  const sandbox = {
    document: { getElementById: element, addEventListener() {}, hidden: false },
    navigator: { onLine: online },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    SpeechSynthesisUtterance: Utterance,
    escHTML: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    setTimeout,
    console,
  };
  sandbox.window = sandbox;
  sandbox.speechSynthesis = synth;
  if (native) sandbox.BaccproTts = native;
  vm.createContext(sandbox);
  vm.runInContext(voiceSource + '\nglobalThis.voiceUnderTest=BaccproVoice;', sandbox);
  return { sandbox, spoken, synth, element, storage };
}

test('French voice reads supplied correction/explanation, adapts formulas, and allows speed selection', () => {
  const env = environment({ voices: [{ name: 'French local', lang: 'fr-FR', voiceURI: 'fr-local', localService: true }] });
  env.sandbox.voiceUnderTest.setExplanation(['Bonne réponse : 2', 'Explication : 1 + 1 = 2']);
  assert.equal(env.element('voice-auto').checked, false);
  env.sandbox.voiceUnderTest.setRate('1.2');
  env.sandbox.voiceUnderTest.play();
  assert.equal(env.spoken.length, 1);
  assert.match(env.spoken[0].text, /Bonne réponse/);
  assert.match(env.spoken[0].text, /1 plus 1 égal à 2/);
  assert.equal(env.spoken[0].lang, 'fr-FR');
  assert.equal(env.spoken[0].rate, 1.2);
  env.sandbox.voiceUnderTest.stop();
  assert.equal(env.element('voice-pause').disabled, true);
});

test('pause, resume, stop, replay, and replacement do not overlap browser speech', () => {
  const env = environment({ voices: [{ name: 'Français', lang: 'fr-FR', voiceURI: 'fr', localService: true }] });
  const voice = env.sandbox.voiceUnderTest;
  voice.setExplanation(['Première explication complète. Deuxième phrase.']);
  voice.play();
  env.spoken[0].onboundary({ charIndex: 9 });
  voice.pause();
  assert.equal(env.element('voice-resume').disabled, false);
  voice.resume();
  assert.match(env.spoken[1].text, /^explication/);
  voice.stop();
  voice.replay();
  assert.equal(env.spoken[2].text, env.spoken[0].text);
  voice.setExplanation(['Correction suivante.']);
  assert.ok(env.synth.cancelCount >= 4);
});

test('missing French voice and missing explanation are reported without invented content', () => {
  const env = environment({ voices: [] });
  const voice = env.sandbox.voiceUnderTest;
  voice.setExplanation(['Explication existante']);
  voice.play();
  assert.equal(env.spoken.length, 0);
  assert.match(env.element('voice-status').textContent, /Aucune voix française/);
  voice.unavailable();
  assert.match(env.element('voice-status').textContent, /aucune explication n’est fournie/);
  assert.equal(env.element('voice-play').disabled, true);
});

test('feedback renderer sends existing correction and teaching details for right and wrong answers', () => {
  const start = html.indexOf('function renderExplication(q){');
  const end = html.indexOf('// TIMER GLOBAL', start);
  const renderer = html.slice(start, end);
  function render(answerCorrect, explanation) {
    const elements = new Map();
    const document = { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {} } });
      return elements.get(id);
    } };
    const captured = [];
    const sandbox = { document, console, escHTML: s => String(s), BaccproVoice: { stop() {}, unavailable() {}, setExplanation(parts) { captured.push(parts); } } };
    vm.createContext(sandbox);
    vm.runInContext(renderer + `renderExplication(${JSON.stringify({
      id: 'Q1', niveau: 'facile', matiere: 'Maths', choix: ['3', '4'], bonne_reponse: 1,
      userWasCorrect: answerCorrect, explication: explanation,
    })});`, sandbox);
    return { elements, captured };
  }
  const data = { resume: 'Quatre est le résultat.', bonneRep: '4', points: ['On additionne les deux termes.'], formule: '2 + 2 = 4', conseil: 'Vérifie le calcul.' };
  const afterCorrect = render(true, data);
  const afterWrong = render(false, data);
  for (const result of [afterCorrect, afterWrong]) {
    const spoken = result.captured[0].join(' ');
    assert.match(spoken, /Bonne réponse : 4/);
    assert.match(spoken, /Quatre est le résultat/);
    assert.match(spoken, /On additionne les deux termes/);
    assert.match(spoken, /Vérifie le calcul/);
  }
  assert.equal(JSON.stringify(afterCorrect.captured), JSON.stringify(afterWrong.captured));
  const noExplanation = render(false, null);
  assert.match(noExplanation.elements.get('expl-empty').textContent, /aucune explication n’est fournie/);
  assert.equal(noExplanation.captured.length, 0);
});

test('Android bridge uses installed French voices, resumes from range callback, and blocks network voices offline', () => {
  const calls = [];
  const native = {
    getVoicesJson: () => JSON.stringify([
      { name: 'fr-local', lang: 'fr-FR', networkRequired: false },
      { name: 'fr-network', lang: 'fr-CA', networkRequired: true },
    ]),
    speak: (...args) => calls.push(args),
    stop: () => calls.push(['stop']),
  };
  const env = environment({ native, online: false });
  const voice = env.sandbox.voiceUnderTest;
  voice.setExplanation(['Correction locale.']);
  voice.play();
  assert.equal(calls[0][2], 'fr-local');
  voice.nativeBoundary(6);
  voice.pause();
  voice.resume();
  assert.equal(calls[calls.length - 1][3], 6);
  const count = calls.length;
  env.element('voice-choice').value = 'native:fr-network';
  voice.play();
  assert.equal(calls.length, count);
  assert.match(env.element('voice-status').textContent, /connexion peut être nécessaire/);
});

test('quiz feedback still invokes the existing explanation renderer and audio has no subscription gate', () => {
  const renderer = html.slice(html.indexOf('function renderExplication(q){'), html.indexOf('// TIMER GLOBAL', html.indexOf('function renderExplication(q){')));
  assert.match(renderer, /BaccproVoice\.setExplanation\(speechParts\)/);
  assert.match(html, /function selectAnswer\(index,clickedBtn,q\)/);
  assert.match(html, /function finishQuiz\(\)/);
  assert.doesNotMatch(voiceSource, /isPremium|is_premium|submitPaymentRequest|activatePremium/);
});

test('all inline JavaScript blocks in the application remain syntactically valid', () => {
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length > 0);
  blocks.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index}.js` }));
});
