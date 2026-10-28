// files: to be written. A tool's page: { id, el (its Greek), view(ctx), top?(ctx), demo? }. See app/tools/index.js.
export default {
  id: 'files',
  el: {},
  view: ({ h, t }) => h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' }, h('p', { class: 'note' }, t('Coming soon.'))))),
}
