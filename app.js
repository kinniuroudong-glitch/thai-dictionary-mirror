const pageSize = 50;
const tokenPattern = /([^\s()（）]+)（([^（）]*)）/gu;
const state = {
  data: {},
  project: '',
  query: '',
  visibleCount: pageSize,
  loading: true,
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
};

function speakThai(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'th-TH';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

function makeThaiButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'thai-action';
  button.textContent = text;
  button.setAttribute('aria-label', '点击播放');
  button.addEventListener('click', () => speakThai(text));
  return button;
}

function makeTokenBreakdown(text) {
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
    fragment.append(makeThaiButton(match[1]));
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

function addField(parent, label, content) {
  const field = document.createElement('div');
  field.className = 'field';
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
    addField(content, '泰语例句', makeThaiButton(entry.泰语例句));
    addField(content, '中文润色', entry.中文润色);
    addField(content, '逐字翻译', makeTokenBreakdown(entry.逐字翻译));
    article.append(number, content);
    elements.list.append(article);
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
