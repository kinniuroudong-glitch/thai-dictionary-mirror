const pageSize = 50;
const tokenPattern = /([^\s()（）]+)（([^（）]*)）/gu;
const deepSeekEndpoint = window.location.hostname.endsWith('github.io')
  ? 'https://thai-dictionary-19.kinniuroudong.chatgpt.site/api/deepseek'
  : '/api/deepseek';
const state = {
  data: {},
  project: '',
  query: '',
  visibleCount: pageSize,
  loading: true,
  explanation: null,
};

const elements = {
  app: document.querySelector('#app'),
  shell: document.querySelector('#topbarShell'),
  reveal: document.querySelector('#topbarReveal'),
  toggle: document.querySelector('#barToggle'),
  project: document.querySelector('#projectSelect'),
  search: document.querySelector('#searchInput'),
  list: document.querySelector('#entryList'),
  loadMore: document.querySelector('#loadMore'),
  explanation: document.querySelector('#explanationPanel'),
};

function localizeDeepSeekError(message) {
  const normalized = String(message).toLowerCase();
  if (normalized.includes('deepseek_insufficient_balance') || normalized.includes('insufficient balance') || normalized.includes('insufficient quota')) {
    return 'DeepSeek 余额不足，请充值后重试。';
  }
  if (normalized.includes('deepseek_invalid_key') || normalized.includes('invalid api key') || normalized.includes('authentication')) {
    return 'DeepSeek 密钥无效，请检查配置。';
  }
  if (normalized.includes('deepseek_rate_limit') || normalized.includes('rate limit')) return '请求太频繁，请稍后重试。';
  if (normalized.includes('sign in') || normalized.includes('unauthorized')) return '请先在原站登录后再使用解释。';
  return 'DeepSeek 暂时无法返回中文解释，请稍后重试。';
}

function speakThai(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'th-TH';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function makeThaiButton(text, onExplain) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'thai-action';
  button.textContent = text;
  button.setAttribute('aria-label', onExplain ? '单击播放，双击解释' : '点击播放');
  let clickTimer = null;
  button.addEventListener('click', (event) => {
    if (!onExplain) {
      speakThai(text);
      return;
    }
    if (event.detail === 2) {
      if (clickTimer !== null) window.clearTimeout(clickTimer);
      clickTimer = null;
      onExplain();
      return;
    }
    clickTimer = window.setTimeout(() => {
      clickTimer = null;
      speakThai(text);
    }, 220);
  });
  button.addEventListener('dblclick', (event) => event.preventDefault());
  return button;
}

function makeTokenBreakdown(text, onExplain) {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let matched = false;
  let match;
  tokenPattern.lastIndex = 0;
  while ((match = tokenPattern.exec(text))) {
    matched = true;
    if (match.index > lastIndex) {
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    fragment.append(makeThaiButton(match[1], () => onExplain(match[1])));
    const gloss = document.createElement('span');
    gloss.className = 'token-gloss';
    gloss.textContent = `（${match[2]}）`;
    fragment.append(gloss);
    lastIndex = tokenPattern.lastIndex;
  }
  if (!matched) return document.createTextNode(text);
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  const wrapper = document.createElement('span');
  wrapper.className = 'token-line';
  wrapper.append(fragment);
  return wrapper;
}

function addField(parent, label, content, className = '') {
  const field = document.createElement('div');
  field.className = `field ${className}`.trim();
  const labelElement = document.createElement('span');
  labelElement.className = 'field-label';
  labelElement.textContent = `${label}：`;
  const paragraph = document.createElement('p');
  if (typeof content === 'string') paragraph.textContent = content;
  else paragraph.append(content);
  field.append(labelElement, paragraph);
  parent.append(field);
}

function getFilteredRows() {
  const rows = state.data[state.project] || [];
  const needle = state.query.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((entry) => [entry.序号, entry.泰语例句, entry.中文润色, entry.逐字翻译]
    .join(' ')
    .toLocaleLowerCase()
    .includes(needle));
}

function render() {
  const rows = getFilteredRows();
  elements.list.replaceChildren();
  if (state.loading) {
    const loading = document.createElement('p');
    loading.className = 'state-message';
    loading.textContent = '...';
    elements.list.append(loading);
    return;
  }
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'state-message';
    empty.textContent = '无结果';
    elements.list.append(empty);
    return;
  }
  for (const entry of rows.slice(0, state.visibleCount)) {
    const article = document.createElement('article');
    article.className = 'entry';
    const number = document.createElement('div');
    number.className = 'entry-number';
    number.textContent = `${entry.序号}.`;
    const content = document.createElement('div');
    content.className = 'entry-content';
    addField(content, '泰语例句', makeThaiButton(entry.泰语例句, () => requestExplanation(entry, entry.泰语例句)), 'field-sentence');
    addField(content, '中文润色', entry.中文润色, 'field-translation');
    addField(content, '逐字翻译', makeTokenBreakdown(entry.逐字翻译, (text) => requestExplanation(entry, text)), 'field-tokens');
    article.append(number, content);
    elements.list.append(article);
  }
}

function renderExplanation() {
  const explanation = state.explanation;
  elements.explanation.hidden = !explanation;
  elements.explanation.replaceChildren();
  if (!explanation) return;

  const heading = document.createElement('div');
  heading.className = 'explanation-head';
  const word = document.createElement('span');
  word.textContent = explanation.text;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close-button';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭');
  close.addEventListener('click', () => {
    state.explanation = null;
    renderExplanation();
  });
  heading.append(word, close);
  elements.explanation.append(heading);

  const body = document.createElement('p');
  body.className = explanation.loading || explanation.error ? 'state-message' : 'explanation-answer';
  body.textContent = explanation.loading ? '...' : (explanation.error || explanation.answer || '');
  elements.explanation.append(body);
}

async function requestExplanation(entry, text) {
  const id = `${Date.now()}-${entry.序号}-${text}`;
  state.explanation = { id, text, loading: true };
  renderExplanation();

  try {
    const response = await fetch(deepSeekEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        text,
        example: entry.泰语例句,
        wordByWord: entry.逐字翻译,
        project: state.project,
        sequence: entry.序号,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '请求失败');
    if (state.explanation?.id === id) {
      state.explanation = { ...state.explanation, loading: false, answer: result.answer };
      renderExplanation();
    }
  } catch (error) {
    if (state.explanation?.id === id) {
      state.explanation = {
        ...state.explanation,
        loading: false,
        error: localizeDeepSeekError(error instanceof Error ? error.message : '请求失败'),
      };
      renderExplanation();
    }
  }
}

function populateProjects() {
  const projects = Object.keys(state.data);
  elements.project.replaceChildren();
  for (const name of projects) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    elements.project.append(option);
  }
  state.project = projects[0] || '';
  elements.project.value = state.project;
}

elements.project.addEventListener('change', () => {
  state.project = elements.project.value;
  state.visibleCount = pageSize;
  state.explanation = null;
  renderExplanation();
  render();
});

elements.search.addEventListener('input', () => {
  state.query = elements.search.value;
  state.visibleCount = pageSize;
  render();
});

elements.toggle.addEventListener('click', (event) => {
  elements.shell.classList.add('topbar-shell-hidden');
  elements.reveal.hidden = false;
  event.currentTarget.blur();
});

elements.reveal.addEventListener('click', () => {
  elements.shell.classList.remove('topbar-shell-hidden');
  elements.reveal.hidden = true;
});

document.addEventListener('pointerdown', (event) => {
  if (!state.explanation) return;
  if (event.target instanceof Element && event.target.closest('#explanationPanel')) return;
  state.explanation = null;
  renderExplanation();
});

const observer = new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) return;
  const rows = getFilteredRows();
  if (state.visibleCount >= rows.length) return;
  state.visibleCount = Math.min(state.visibleCount + pageSize, rows.length);
  render();
}, { rootMargin: '640px' });
observer.observe(elements.loadMore);

fetch('./data.json')
  .then((response) => {
    if (!response.ok) throw new Error('data');
    return response.json();
  })
  .then((data) => {
    state.data = data;
    state.loading = false;
    populateProjects();
    render();
  })
  .catch(() => {
    state.loading = false;
    const error = document.createElement('p');
    error.className = 'state-message';
    error.textContent = '无法加载';
    elements.list.replaceChildren(error);
  });
