import { getSession } from '../lib/auth.js';
import { getTranscript, getRecordingById, saveMoM, getMoM } from '../lib/database.js';
import { generateMoM, isAIAvailable, getBlankTemplate, momToMarkdown } from '../lib/mom-generator.js';

// ═══════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════
const $ = (sel) => document.querySelector(sel);

const els = {
  loadingState: $('#loading-state'),
  aiProgress: $('#ai-progress'),
  momEditor: $('#mom-editor'),
  btnGenerateAi: $('#btn-generate-ai'),
  btnExportPdf: $('#btn-export-pdf'),
  btnExportMd: $('#btn-export-md'),
  btnCopy: $('#btn-copy'),
  btnSave: $('#btn-save'),

  momTitle: $('#mom-title'),
  momDate: $('#mom-date'),
  momParticipants: $('#mom-participants'),
  momSummary: $('#mom-summary'),
  agendaContainer: $('#agenda-container'),
  nextStepsContainer: $('#next-steps-container'),
  momNotes: $('#mom-notes'),
  originalTranscript: $('#original-transcript'),
  btnAddAgenda: $('#btn-add-agenda'),
  btnAddStep: $('#btn-add-step'),
};

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let recordingId = null;
let transcriptText = '';
let currentMoM = null;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
async function init() {
  // Get recording ID from URL
  const params = new URLSearchParams(window.location.search);
  recordingId = params.get('recording_id');

  const { data } = await getSession();
  if (!data?.session) {
    els.loadingState.innerHTML = `
      <div style="font-size:2rem">🔒</div>
      <h2>Please sign in</h2>
      <p style="color:var(--text-tertiary)">Open the RecordX extension popup to sign in first</p>
    `;
    return;
  }

  // Check if AI is available
  if (!isAIAvailable()) {
    els.btnGenerateAi.disabled = true;
    els.btnGenerateAi.title = 'OpenAI API key not configured';
  }

  bindEvents();
  await loadData();
}

// ═══════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ═══════════════════════════════════════════════════════════════
function bindEvents() {
  els.btnGenerateAi.addEventListener('click', handleGenerateAI);
  els.btnExportPdf.addEventListener('click', handleExportPDF);
  els.btnExportMd.addEventListener('click', handleExportMarkdown);
  els.btnCopy.addEventListener('click', handleCopy);
  els.btnSave.addEventListener('click', handleSave);
  els.btnAddAgenda.addEventListener('click', () => addAgendaItem());
  els.btnAddStep.addEventListener('click', () => addNextStep());
}

// ═══════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════
async function loadData() {
  if (!recordingId) {
    // No recording — blank template
    els.loadingState.classList.add('hidden');
    els.momEditor.classList.remove('hidden');
    populateForm(getBlankTemplate());
    return;
  }

  try {
    // Load existing MoM if available
    const { data: existingMoM } = await getMoM(recordingId);
    if (existingMoM) {
      currentMoM = existingMoM;
      const content = typeof existingMoM.content === 'string'
        ? JSON.parse(existingMoM.content)
        : existingMoM.content;
      populateForm(content);
    } else {
      populateForm(getBlankTemplate());
    }

    // Load recording info
    const { data: recording } = await getRecordingById(recordingId);
    if (recording && !currentMoM) {
      els.momTitle.value = recording.title || '';
    }

    // Load transcript
    const { data: transcript } = await getTranscript(recordingId);
    if (transcript?.content) {
      transcriptText = transcript.content;
      els.originalTranscript.textContent = transcriptText;
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }

  els.loadingState.classList.add('hidden');
  els.momEditor.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
// FORM POPULATION
// ═══════════════════════════════════════════════════════════════
function populateForm(mom) {
  els.momTitle.value = mom.title || '';
  els.momDate.value = mom.date || new Date().toISOString().slice(0, 10);
  els.momParticipants.value = (mom.participants || []).join(', ');
  els.momSummary.value = mom.summary || '';
  els.momNotes.value = mom.notes || '';

  // Agenda items
  els.agendaContainer.innerHTML = '';
  const agendaItems = mom.agenda_items?.length ? mom.agenda_items : [{ topic: '', discussion: '', decisions: [''], action_items: [{ task: '', assignee: '', deadline: '' }] }];
  agendaItems.forEach((item) => addAgendaItem(item));

  // Next steps
  els.nextStepsContainer.innerHTML = '';
  const steps = mom.next_steps?.length ? mom.next_steps : [''];
  steps.forEach((step) => addNextStep(step));
}

// ═══════════════════════════════════════════════════════════════
// DYNAMIC FORM ELEMENTS
// ═══════════════════════════════════════════════════════════════
function addAgendaItem(data = null) {
  const index = els.agendaContainer.children.length + 1;
  const item = document.createElement('div');
  item.className = 'agenda-item';
  item.innerHTML = `
    <div class="agenda-item__header">
      <span class="agenda-item__number">Agenda #${index}</span>
      <button class="agenda-item__remove" title="Remove" type="button">✕</button>
    </div>
    <div class="form-group">
      <label class="form-label">Topic</label>
      <input type="text" class="input agenda-topic" value="${escapeHtml(data?.topic || '')}" placeholder="Agenda topic" />
    </div>
    <div class="form-group">
      <label class="form-label">Discussion</label>
      <textarea class="textarea agenda-discussion" rows="2" placeholder="Key discussion points...">${escapeHtml(data?.discussion || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Decisions</label>
      <div class="decisions-list">
        ${(data?.decisions?.length ? data.decisions : ['']).map((d) => `
          <div class="list-item">
            <input type="text" class="input decision-input" value="${escapeHtml(d)}" placeholder="Decision..." />
            <button class="list-item__remove" title="Remove" type="button">✕</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn--small btn--ghost btn--add-decision" type="button">+ Decision</button>
    </div>
    <div class="form-group">
      <label class="form-label">Action Items</label>
      <table class="action-items-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assignee</th>
            <th>Deadline</th>
            <th></th>
          </tr>
        </thead>
        <tbody class="action-items-body">
          ${(data?.action_items?.length ? data.action_items : [{ task: '', assignee: '', deadline: '' }]).map((a) => `
            <tr>
              <td><input type="text" class="input action-task" value="${escapeHtml(a.task || '')}" placeholder="Task..." /></td>
              <td><input type="text" class="input action-assignee" value="${escapeHtml(a.assignee || '')}" placeholder="Who?" /></td>
              <td><input type="text" class="input action-deadline" value="${escapeHtml(a.deadline || '')}" placeholder="When?" /></td>
              <td><button class="btn--remove-row" title="Remove" type="button">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <button class="btn btn--small btn--ghost btn--add-action" type="button">+ Action Item</button>
    </div>
  `;

  // Bind remove agenda
  item.querySelector('.agenda-item__remove').addEventListener('click', () => {
    item.remove();
    renumberAgendas();
  });

  // Bind add decision
  item.querySelector('.btn--add-decision').addEventListener('click', () => {
    const list = item.querySelector('.decisions-list');
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <input type="text" class="input decision-input" placeholder="Decision..." />
      <button class="list-item__remove" title="Remove" type="button">✕</button>
    `;
    div.querySelector('.list-item__remove').addEventListener('click', () => div.remove());
    list.appendChild(div);
  });

  // Bind remove decision
  item.querySelectorAll('.decisions-list .list-item__remove').forEach((btn) => {
    btn.addEventListener('click', () => btn.parentElement.remove());
  });

  // Bind add action item
  item.querySelector('.btn--add-action').addEventListener('click', () => {
    const tbody = item.querySelector('.action-items-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="input action-task" placeholder="Task..." /></td>
      <td><input type="text" class="input action-assignee" placeholder="Who?" /></td>
      <td><input type="text" class="input action-deadline" placeholder="When?" /></td>
      <td><button class="btn--remove-row" title="Remove" type="button">✕</button></td>
    `;
    tr.querySelector('.btn--remove-row').addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
  });

  // Bind remove action row
  item.querySelectorAll('.btn--remove-row').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('tr').remove());
  });

  els.agendaContainer.appendChild(item);
}

function addNextStep(text = '') {
  const div = document.createElement('div');
  div.className = 'list-item';
  div.innerHTML = `
    <input type="text" class="input next-step-input" value="${escapeHtml(text)}" placeholder="Next step..." />
    <button class="list-item__remove" title="Remove" type="button">✕</button>
  `;
  div.querySelector('.list-item__remove').addEventListener('click', () => div.remove());
  els.nextStepsContainer.appendChild(div);
}

function renumberAgendas() {
  els.agendaContainer.querySelectorAll('.agenda-item__number').forEach((el, i) => {
    el.textContent = `Agenda #${i + 1}`;
  });
}

// ═══════════════════════════════════════════════════════════════
// COLLECT FORM DATA
// ═══════════════════════════════════════════════════════════════
function collectFormData() {
  const agendaItems = [];
  els.agendaContainer.querySelectorAll('.agenda-item').forEach((item) => {
    const decisions = [];
    item.querySelectorAll('.decision-input').forEach((input) => {
      if (input.value.trim()) decisions.push(input.value.trim());
    });

    const actionItems = [];
    item.querySelectorAll('.action-items-body tr').forEach((row) => {
      const task = row.querySelector('.action-task')?.value.trim() || '';
      const assignee = row.querySelector('.action-assignee')?.value.trim() || '';
      const deadline = row.querySelector('.action-deadline')?.value.trim() || '';
      if (task) actionItems.push({ task, assignee, deadline });
    });

    agendaItems.push({
      topic: item.querySelector('.agenda-topic')?.value.trim() || '',
      discussion: item.querySelector('.agenda-discussion')?.value.trim() || '',
      decisions,
      action_items: actionItems,
    });
  });

  const nextSteps = [];
  els.nextStepsContainer.querySelectorAll('.next-step-input').forEach((input) => {
    if (input.value.trim()) nextSteps.push(input.value.trim());
  });

  return {
    title: els.momTitle.value.trim(),
    date: els.momDate.value,
    participants: els.momParticipants.value.split(',').map((s) => s.trim()).filter(Boolean),
    summary: els.momSummary.value.trim(),
    agenda_items: agendaItems,
    next_steps: nextSteps,
    notes: els.momNotes.value.trim(),
  };
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════
async function handleGenerateAI() {
  if (!transcriptText) {
    alert('No transcript available to generate MoM from.');
    return;
  }

  els.aiProgress.classList.remove('hidden');
  els.btnGenerateAi.disabled = true;

  const { data, error } = await generateMoM(transcriptText, {
    meetingTitle: els.momTitle.value || undefined,
  });

  els.aiProgress.classList.add('hidden');
  els.btnGenerateAi.disabled = false;

  if (error) {
    alert('AI generation failed: ' + error.message);
    return;
  }

  populateForm(data);
}

async function handleSave() {
  if (!recordingId) {
    alert('Cannot save — no recording associated');
    return;
  }

  const content = collectFormData();

  els.btnSave.textContent = 'Saving...';
  els.btnSave.disabled = true;

  const { error } = await saveMoM({
    recording_id: recordingId,
    title: content.title,
    content: JSON.stringify(content),
    is_ai_generated: false,
  });

  els.btnSave.textContent = error ? 'Error!' : 'Saved!';
  els.btnSave.disabled = false;

  setTimeout(() => {
    els.btnSave.textContent = 'Save';
  }, 2000);

  if (error) {
    console.error('Save error:', error);
  }
}

function handleExportPDF() {
  window.print();
}

function handleExportMarkdown() {
  const content = collectFormData();
  const md = momToMarkdown(content);

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MoM_${content.title || 'meeting'}_${content.date}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleCopy() {
  const content = collectFormData();
  const md = momToMarkdown(content);

  await navigator.clipboard.writeText(md);
  els.btnCopy.textContent = 'Copied!';
  setTimeout(() => {
    els.btnCopy.textContent = 'Copy';
  }, 2000);
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
