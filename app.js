const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const csrfToken = $('meta[name="csrf-token"]').content;
let products = [];
let categories = [];

const money = (value) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
const number = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const initials = (name) => String(name || '?').trim().slice(0, 2).toUpperCase();
const dateTime = (value) => {
  if (!value) return 'Date inconnue';
  // SQLite returns local-looking timestamps without timezone information.
  return String(value).replace('T', ' ').slice(0, 16);
};
const stockStatus = (product) => {
  if (Number(product.quantity) === 0) return { label: 'Rupture', cls: 'status-out' };
  if (Number(product.quantity) <= Number(product.min_quantity)) return { label: 'Stock faible', cls: 'status-low' };
  return { label: 'Disponible', cls: 'status-ok' };
};

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRFToken'] = csrfToken;
  }
  const response = await fetch(url, { ...options, headers });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `Une erreur est survenue (${response.status}).`);
  return data;
}

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-region').appendChild(node);
  window.setTimeout(() => node.remove(), 4200);
}
function showError(id, message) {
  const el = $(`#${id}`);
  el.textContent = message;
  el.classList.toggle('show', Boolean(message));
}
function openModal(id) {
  const modal = $(`#${id}`);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  const firstInput = modal.querySelector('input:not([type="hidden"]), select');
  if (firstInput) window.setTimeout(() => firstInput.focus(), 50);
}
function closeModal(id) {
  const modal = $(`#${id}`);
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
$$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => {
  if (event.target === backdrop) closeModal(backdrop.id);
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') $$('.modal-backdrop.open').forEach(modal => closeModal(modal.id));
});

function navigate(view) {
  const labels = { dashboard: "Vue d'ensemble", products: 'Gestion des produits', movements: 'Mouvements de stock' };
  $$('.page-view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb-current').textContent = labels[view] || labels.dashboard;
  if (view === 'products') loadProducts();
  if (view === 'movements') loadMovements();
}
$$('.nav-item').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));
$$('[data-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.go)));

function productNameCell(product) {
  return `<div class="product-cell"><span class="product-symbol">${escapeHtml(initials(product.name))}</span><div><div class="product-title">${escapeHtml(product.name)}</div><div class="product-sub">${escapeHtml(product.sku)}</div></div></div>`;
}
function statusBadge(product) {
  const status = stockStatus(product);
  return `<span class="status-badge ${status.cls}">${status.label}</span>`;
}
function renderRecentProducts(list) {
  const target = $('#recent-products');
  const recent = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
  if (!recent.length) {
    target.innerHTML = '<tr><td colspan="4" class="empty-cell">Aucun produit. Ajoute ta première référence pour commencer.</td></tr>';
    return;
  }
  target.innerHTML = recent.map(p => `<tr><td>${productNameCell(p)}</td><td><span class="category-chip">${escapeHtml(p.category)}</span></td><td>${number(p.quantity)}</td><td>${statusBadge(p)}</td></tr>`).join('');
}
function renderProducts(list) {
  const target = $('#products-table');
  $('#results-count').textContent = `${list.length} produit${list.length > 1 ? 's' : ''}`;
  if (!list.length) {
    target.innerHTML = '<tr><td colspan="7" class="empty-cell">Aucun résultat. Essaie une autre recherche ou ajoute un produit.</td></tr>';
    return;
  }
  target.innerHTML = list.map(p => `<tr>
    <td><span class="product-sub">${escapeHtml(p.sku)}</span></td>
    <td>${productNameCell(p)}</td>
    <td><span class="category-chip">${escapeHtml(p.category)}</span></td>
    <td><strong>${number(p.quantity)}</strong></td><td>${money(p.unit_price)}</td><td>${statusBadge(p)}</td>
    <td><div class="action-group"><button class="icon-action" data-edit="${p.id}" title="Modifier le produit" aria-label="Modifier ${escapeHtml(p.name)}">✎</button><button class="icon-action delete" data-delete="${p.id}" title="Supprimer le produit" aria-label="Supprimer ${escapeHtml(p.name)}">×</button></div></td>
  </tr>`).join('');
  $$('[data-edit]').forEach(button => button.addEventListener('click', () => editProduct(Number(button.dataset.edit))));
  $$('[data-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(Number(button.dataset.delete))));
}
function updateCategoryFilter() {
  const select = $('#category-filter');
  const current = select.value;
  select.innerHTML = '<option value="">Toutes les catégories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (categories.includes(current)) select.value = current;
}
function applyProductFilters() {
  const query = $('#product-search').value.trim().toLocaleLowerCase('fr');
  const category = $('#category-filter').value;
  const filtered = products.filter(p => {
    const matchesQuery = !query || [p.name, p.sku, p.category].some(v => String(v).toLocaleLowerCase('fr').includes(query));
    return matchesQuery && (!category || p.category === category);
  });
  renderProducts(filtered);
}

async function loadProducts() {
  try {
    const data = await api('/api/products');
    products = data.products;
    categories = data.categories;
    $('#nav-product-count').textContent = products.length;
    updateCategoryFilter();
    renderProducts(products);
    renderRecentProducts(products);
    populateMovementProducts();
  } catch (err) { toast(err.message, true); }
}
async function loadDashboard() {
  try {
    const [dashboard, productData] = await Promise.all([api('/api/dashboard'), api('/api/products')]);
    products = productData.products;
    categories = productData.categories;
    const t = dashboard.totals;
    $('#stock-value').textContent = money(t.stock_value);
    $('#product-count').textContent = number(t.product_count);
    $('#unit-count').textContent = number(t.unit_count);
    $('#alert-count').textContent = number(Number(t.out_of_stock) + Number(t.low_stock));
    $('#out-count').textContent = number(t.out_of_stock);
    $('#low-count').textContent = number(t.low_stock);
    $('#nav-product-count').textContent = number(t.product_count);
    renderRecentProducts(products);
    renderActivity(dashboard.recent_movements, $('#recent-activity'), true);
    populateMovementProducts();
  } catch (err) { toast(err.message, true); }
}
function renderActivity(movements, target, compact = false) {
  if (!movements.length) {
    target.innerHTML = '<div class="empty-state">Aucun mouvement enregistré pour le moment.</div>';
    return;
  }
  target.innerHTML = movements.map(m => {
    const entry = m.movement_type === 'entry';
    return `<div class="activity-item"><span class="activity-icon ${entry ? 'entry' : 'exit'}">${entry ? '↙' : '↗'}</span>
      <div class="activity-copy"><strong>${escapeHtml(m.product_name)}</strong><small>${entry ? 'Entrée' : 'Sortie'} · ${escapeHtml(dateTime(m.created_at))}${m.note ? ` · ${escapeHtml(m.note)}` : ''}</small></div>
      <span class="activity-quantity ${entry ? 'entry' : 'exit'}">${entry ? '+' : '−'}${number(m.quantity)}</span></div>`;
  }).join('');
}
async function loadMovements() {
  try {
    const data = await api('/api/movements');
    const target = $('#movements-table');
    if (!data.movements.length) {
      target.innerHTML = '<tr><td colspan="5" class="empty-cell">Aucun mouvement enregistré.</td></tr>';
      return;
    }
    target.innerHTML = data.movements.map(m => `<tr><td>${escapeHtml(dateTime(m.created_at))}</td><td>${productNameCell({name: m.product_name, sku: m.sku})}</td>
      <td><span class="movement-type ${m.movement_type}">${m.movement_type === 'entry' ? '↙ Entrée' : '↗ Sortie'}</span></td>
      <td><strong>${number(m.quantity)}</strong></td><td>${escapeHtml(m.note || '—')}</td></tr>`).join('');
  } catch (err) { toast(err.message, true); }
}
function populateMovementProducts() {
  const select = $('#movement-product');
  const current = select.value;
  select.innerHTML = '<option value="">Choisir un produit…</option>' + products.map(p => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.sku)} (${number(p.quantity)} en stock)</option>`).join('');
  if (products.some(p => String(p.id) === current)) select.value = current;
  updateMovementHint();
}
function updateMovementHint() {
  const id = Number($('#movement-product').value);
  const p = products.find(item => item.id === id);
  $('#movement-stock-hint').textContent = p ? `Stock actuel : ${number(p.quantity)} unité(s). Une sortie supérieure à cette quantité sera refusée.` : 'Choisis un produit pour voir son stock actuel.';
}
$('#movement-product').addEventListener('change', updateMovementHint);

function resetProductForm() {
  $('#product-form').reset();
  $('#product-id').value = '';
  $('#product-quantity').disabled = false;
  $('#product-quantity').value = '0';
  $('#product-min').value = '5';
  $('#product-price').value = '0';
  $('#product-modal-title').textContent = 'Ajouter un produit';
  $('#save-product').innerHTML = 'Enregistrer le produit <span>→</span>';
  $('#edit-hint').textContent = "La quantité initiale sera enregistrée comme un mouvement d'entrée. Les changements de quantité ultérieurs se font dans « Mouvements ».";
  showError('product-error', '');
}
function openNewProduct() { resetProductForm(); openModal('product-modal'); }
$('#add-product').addEventListener('click', openNewProduct);
$('#quick-add').addEventListener('click', openNewProduct);

function editProduct(id) {
  const p = products.find(item => item.id === id);
  if (!p) return toast('Ce produit n’a pas été retrouvé. Actualise la liste.', true);
  resetProductForm();
  $('#product-id').value = p.id;
  $('#product-sku').value = p.sku;
  $('#product-name').value = p.name;
  $('#product-category').value = p.category;
  $('#product-quantity').value = p.quantity;
  $('#product-quantity').disabled = true;
  $('#product-price').value = p.unit_price;
  $('#product-min').value = p.min_quantity;
  $('#product-modal-title').textContent = 'Modifier le produit';
  $('#save-product').innerHTML = 'Enregistrer les modifications <span>→</span>';
  $('#edit-hint').textContent = 'La quantité ne peut pas être modifiée ici afin de préserver l’historique. Utilise « Mouvements » pour enregistrer une entrée ou une sortie.';
  openModal('product-modal');
}
$('#product-form').addEventListener('submit', async event => {
  event.preventDefault();
  showError('product-error', '');
  const id = $('#product-id').value;
  const payload = {
    sku: $('#product-sku').value.trim(),
    name: $('#product-name').value.trim(),
    category: $('#product-category').value.trim(),
    quantity: Number($('#product-quantity').value),
    unit_price: Number($('#product-price').value),
    min_quantity: Number($('#product-min').value)
  };
  const button = $('#save-product');
  button.disabled = true;
  try {
    await api(id ? `/api/products/${id}` : '/api/products', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    closeModal('product-modal');
    toast(id ? 'Produit mis à jour.' : 'Produit ajouté à l’inventaire.');
    await Promise.all([loadDashboard(), loadProducts()]);
  } catch (err) { showError('product-error', err.message); }
  finally { button.disabled = false; }
});
async function deleteProduct(id) {
  const p = products.find(item => item.id === id);
  if (!p) return;
  if (!window.confirm(`Supprimer « ${p.name} » ? Cette action est irréversible si le produit n’a aucun mouvement.`)) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE', headers: { 'X-CSRFToken': csrfToken } });
    toast('Produit supprimé.');
    await Promise.all([loadDashboard(), loadProducts()]);
  } catch (err) { toast(err.message, true); }
}

$('#add-movement').addEventListener('click', async () => {
  await loadProducts();
  $('#movement-form').reset();
  $('#movement-quantity').value = '1';
  showError('movement-error', '');
  updateMovementHint();
  openModal('movement-modal');
});
$('#movement-form').addEventListener('submit', async event => {
  event.preventDefault();
  showError('movement-error', '');
  const payload = {
    product_id: Number($('#movement-product').value),
    movement_type: $('#movement-type').value,
    quantity: Number($('#movement-quantity').value),
    note: $('#movement-note').value.trim()
  };
  const button = $('#save-movement');
  button.disabled = true;
  try {
    await api('/api/movements', { method: 'POST', body: JSON.stringify(payload) });
    closeModal('movement-modal');
    toast('Mouvement enregistré. Le stock a été mis à jour.');
    await Promise.all([loadDashboard(), loadProducts(), loadMovements()]);
  } catch (err) { showError('movement-error', err.message); }
  finally { button.disabled = false; }
});

$('#product-search').addEventListener('input', applyProductFilters);
$('#category-filter').addEventListener('change', applyProductFilters);

loadDashboard();
