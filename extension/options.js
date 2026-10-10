/* global linenUi, Explain */
// Explain options (Canvas 12): the provider, its model, its address (LK6) and key (LK7),
// and the study log (EX10). The page asks Linen for everything through linenUi.call;
// it never sees the key.
'use strict'
;(async () => {
  const $ = (id) => document.getElementById(id)
  const call = (method, params) => linenUi.call(method, params)

  async function load() {
    const raw = await call('storage.get', { key: 'settings' })
    let s = {}
    try {
      s = raw ? JSON.parse(raw) : {}
    } catch {
      s = {}
    }
    return { provider: s.provider || null, models: s.models || {}, studyLog: s.studyLog === true }
  }
  const save = (s) => call('storage.set', { key: 'settings', value: JSON.stringify(s) })

  let settings = await load()

  const select = $('provider')
  const none = document.createElement('option')
  none.value = ''
  none.textContent = 'Choose a provider…'
  select.append(none)
  for (const key of Explain.PRESET_ORDER) {
    const o = document.createElement('option')
    o.value = key
    o.textContent = `${Explain.PRESETS[key].name} · ${Explain.PRESETS[key].host}`
    select.append(o)
  }

  async function render() {
    const key = settings.provider
    select.value = key || ''
    const p = key ? Explain.PRESETS[key] : null
    $('provider-note').textContent = p
      ? 'Choosing a provider asks to allow its address.'
      : 'Nothing is sent until you choose a provider and Explain a passage.'
    $('model').disabled = !p
    $('model').value = p ? settings.models[key] || p.model : ''
    $('model').placeholder = key === 'ollama' ? 'for example qwen3' : ''
    $('model-note').textContent = !p
      ? ''
      : key === 'ollama'
        ? 'A model you have pulled with Ollama.'
        : `Default: ${p.model}. A model that answers without long reasoning stays within Linen’s 10 seconds.`
    const allowed = p ? await call('permissions.has', { host: p.host }) : false
    $('host-state').textContent = !p ? '—' : allowed ? `Allowed: ${p.host}` : `Not allowed yet: ${p.host}`
    $('allow').hidden = !p || allowed
    const keyed = !!(p && p.scheme)
    $('key-label').hidden = !keyed
    $('key-row').hidden = !keyed
    if (keyed) {
      const has = await call('secrets.has', { name: Explain.secretName(key) })
      $('key-state').textContent = has ? 'In your Mac’s Keychain ·' : 'No key yet ·'
      $('key').textContent = has ? 'Change key…' : 'Add key…'
      $('key-note').textContent = `Explain never sees the key. Linen adds it only to requests to ${p.host}.`
    }
    $('studylog').checked = settings.studyLog
  }

  async function allow() {
    const p = Explain.PRESETS[settings.provider]
    if (!p) return false
    return call('permissions.request', {
      host: p.host,
      purpose: `To send the passages you choose to explain to ${p.name}.`,
    })
  }

  select.addEventListener('change', async () => {
    settings = { ...settings, provider: select.value || null }
    await save(settings)
    if (settings.provider) await allow()
    await render()
  })
  $('model').addEventListener('change', async () => {
    const key = settings.provider
    if (!key) return
    settings = { ...settings, models: { ...settings.models, [key]: $('model').value.trim() } }
    await save(settings)
    await render()
  })
  $('allow').addEventListener('click', async () => {
    await allow()
    await render()
  })
  $('key').addEventListener('click', async () => {
    const p = Explain.PRESETS[settings.provider]
    if (!p) return
    if (!(await call('permissions.has', { host: p.host })) && !(await allow())) return
    await call('secrets.request', {
      name: Explain.secretName(settings.provider),
      host: p.host,
      label: `${p.name} API key`,
    })
    await render()
  })
  $('studylog').addEventListener('change', async () => {
    settings = { ...settings, studyLog: $('studylog').checked }
    await save(settings)
  })

  await render()
})()
