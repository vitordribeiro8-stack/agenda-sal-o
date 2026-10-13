// Registro do Service Worker para suporte Offline
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Erro:', err));
}

// Estado Global da Aplicação
let dataSelecionada = new Date().toISOString().split('T')[0];
let atendimentos = JSON.parse(localStorage.getItem('atendimentos')) || [];
let clientes = JSON.parse(localStorage.getItem('clientes')) || [];

// Funções Auxiliares de Tempo (Converte "09:30" para 570 minutos)
function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  renderizarAgenda();
  atualizarDatalistClientes();
});

// Troca de Abas da Navegação
function trocarAba(aba) {
  document.getElementById('aba-agenda').style.display = aba === 'agenda' ? 'block' : 'none';
  document.getElementById('aba-clientes').style.display = aba === 'clientes' ? 'block' : 'none';
  document.getElementById('aba-config').style.display = aba === 'config' ? 'block' : 'none';

  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`nav-${aba}`).classList.add('active');

  if (aba === 'clientes') renderizarClientes();
}

// Controle de Datas
function mudarData(dias) {
  let d = new Date(dataSelecionada + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  dataSelecionada = d.toISOString().split('T')[0];
  renderizarAgenda();
}

// Renderizar Agenda
function renderizarAgenda() {
  document.getElementById('data-atual-txt').innerText = new Date(dataSelecionada + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

  const lista = document.getElementById('lista-atendimentos');
  lista.innerHTML = '';

  // Filtra e Ordena por Horário (usando número de minutos)
  const doDia = atendimentos
    .filter(a => a.data === dataSelecionada)
    .sort((a, b) => a.horarioInicio - b.horarioInicio);

  let totalDia = 0;
  
  doDia.forEach(a => {
    totalDia += Number(a.valor);
    const cliente = clientes.find(c => c.id === a.clienteId) || { nome: a.nomeTemp || 'Cliente' };
    const fim = minutesToTime(a.horarioInicio + Number(a.duracao));

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div style="display:flex; justify-between; align-items:center;">
        <strong>${minutesToTime(a.horarioInicio)} - ${fim}</strong>
        <span class="status-tag status-${a.status}">${a.status.toUpperCase()}</span>
      </div>
      <h4 style="margin: 6px 0;">${cliente.nome}</h4>
      <p style="font-size: 14px; color: #aaa;">${a.servico} - R$ ${Number(a.valor).toFixed(2)} (${a.pago ? 'Pago' : 'Pendente'})</p>
      ${a.formula ? `<p style="font-size: 12px; color: var(--accent); margin-top: 4px;">Fórmula: ${a.formula}</p>` : ''}
      
      <div style="display:flex; gap: 8px; margin-top: 12px;">
        <button class="btn btn-wa" style="flex:1;" onclick="enviarWhatsApp('${a.telefone}', '${cliente.nome}', '${minutesToTime(a.horarioInicio)}')">WhatsApp</button>
        <button class="btn btn-secondary" style="flex:1;" onclick="editarAtendimento('${a.id}')">Editar</button>
      </div>
    `;
    lista.appendChild(card);
  });

  document.getElementById('total-dia').innerText = totalDia.toFixed(2);
  calcularTotalMes();
}

// Calcular Financeiro do Mês
function calcularTotalMes() {
  const mesAtual = dataSelecionada.substring(0, 7);
  const total = atendimentos
    .filter(a => a.data.startsWith(mesAtual))
    .reduce((acc, cur) => acc + Number(cur.valor), 0);
  document.getElementById('total-mes').innerText = total.toFixed(2);
}

// Checagem de Conflitos de Horários
function checarConflitos() {
  const data = document.getElementById('input-data').value;
  const hora = document.getElementById('input-horario').value;
  const duracao = Number(document.getElementById('input-duracao').value);
  const idAtual = document.getElementById('atendimento-id').value;
  const msg = document.getElementById('msg-conflito');

  msg.innerText = '';
  if (!hora || !data) return;

  const inicioNovo = timeToMinutes(hora);
  const fimNovo = inicioNovo + duracao;

  const conflito = atendimentos.some(a => {
    if (a.id === idAtual || a.data !== data) return false;
    const inicioExistente = a.horarioInicio;
    const fimExistente = a.horarioInicio + Number(a.duracao);
    return (inicioNovo < fimExistente && fimNovo > inicioExistente);
  });

  if (conflito) msg.innerText = '⚠️ Atenção: Existe outro agendamento neste horário!';
}

// Salvar / Criar Atendimento
function salvarAtendimento(e) {
  e.preventDefault();

  const id = document.getElementById('atendimento-id').value || Date.now().toString();
  const nomeCliente = document.getElementById('input-cliente').value.trim();
  const telefone = document.getElementById('input-telefone').value.replace(/\D/g, '');
  const data = document.getElementById('input-data').value;
  const hora = document.getElementById('input-horario').value;
  const duracao = document.getElementById('input-duracao').value;
  const servico = document.getElementById('input-servico').value;
  const valor = document.getElementById('input-valor').value;
  const pago = document.getElementById('input-pago').value === 'true';
  const status = document.getElementById('input-status').value;
  const formula = document.getElementById('input-formula').value;

  // Gerencia Ficha da Cliente
  let cliente = clientes.find(c => c.nome.toLowerCase() === nomeCliente.toLowerCase());
  if (!cliente) {
    cliente = { id: Date.now().toString(), nome: nomeCliente, telefone: telefone, ultimaFormula: formula };
    clientes.push(cliente);
  } else {
    cliente.telefone = telefone;
    if (formula) cliente.ultimaFormula = formula;
  }
  localStorage.setItem('clientes', JSON.stringify(clientes));

  // Salva Atendimento
  const novoAtendimento = {
    id, clienteId: cliente.id, telefone, data,
    horarioInicio: timeToMinutes(hora), duracao,
    servico, valor, pago, status, formula
  };

  const index = atendimentos.findIndex(a => a.id === id);
  if (index > -1) atendimentos[index] = novoAtendimento;
  else atendimentos.push(novoAtendimento);

  localStorage.setItem('atendimentos', JSON.stringify(atendimentos));
  fecharModal();
  renderizarAgenda();
  atualizarDatalistClientes();
}

// Autopreencher dados ao selecionar cliente existente
function autopreencherCliente() {
  const nome = document.getElementById('input-cliente').value;
  const cliente = clientes.find(c => c.nome.toLowerCase() === nome.toLowerCase());
  if (cliente) {
    document.getElementById('input-telefone').value = cliente.telefone;
    if (cliente.ultimaFormula) {
      document.getElementById('input-formula').value = cliente.ultimaFormula;
    }
  }
}

function atualizarDatalistClientes() {
  const list = document.getElementById('sugestoes-clientes');
  list.innerHTML = clientes.map(c => `<option value="${c.nome}">`).join('');
}

// WhatsApp Integration (Formato wa.me)
function enviarWhatsApp(tel, nome, hora) {
  const msg = encodeURIComponent(`Olá ${nome}! Confirmamos seu agendamento hoje às ${hora}?`);
  window.open(`https://wa.me/55${tel}?text=${msg}`, '_blank');
}

// Modais
function abrirModalAtendimento() {
  document.getElementById('form-atendimento').reset();
  document.getElementById('atendimento-id').value = '';
  document.getElementById('input-data').value = dataSelecionada;
  document.getElementById('modal-atendimento').style.display = 'flex';
}

function fecharModal() {
  document.getElementById('modal-atendimento').style.display = 'none';
}

function editarAtendimento(id) {
  const a = atendimentos.find(item => item.id === id);
  const cliente = clientes.find(c => c.id === a.clienteId);

  document.getElementById('atendimento-id').value = a.id;
  document.getElementById('input-cliente').value = cliente ? cliente.nome : '';
  document.getElementById('input-telefone').value = a.telefone;
  document.getElementById('input-data').value = a.data;
  document.getElementById('input-horario').value = minutesToTime(a.horarioInicio);
  document.getElementById('input-duracao').value = a.duracao;
  document.getElementById('input-servico').value = a.servico;
  document.getElementById('input-valor').value = a.valor;
  document.getElementById('input-pago').value = a.pago.toString();
  document.getElementById('input-status').value = a.status;
  document.getElementById('input-formula').value = a.formula || '';

  document.getElementById('modal-atendimento').style.display = 'flex';
}

// Visualização de Clientes e Histórico
function renderizarClientes(filtro = '') {
  const container = document.getElementById('lista-clientes');
  container.innerHTML = '';

  const filtrados = clientes.filter(c => c.nome.toLowerCase().includes(filtro.toLowerCase()));

  filtrados.forEach(c => {
    const historico = atendimentos.filter(a => a.clienteId === c.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${c.nome}</h3>
      <p style="font-size: 14px; color: #aaa;">Tel: ${c.telefone}</p>
      <p style="font-size: 13px; color: var(--accent); margin-top: 4px;">Última Fórmula: ${c.ultimaFormula || 'Nenhuma registrada'}</p>
      <small style="color: #666;">Total de Atendimentos: ${historico.length}</small>
    `;
    container.appendChild(card);
  });
}

function filtrarClientes() {
  renderizarClientes(document.getElementById('busca-cliente').value);
}

// Backup (Exportar/Importar JSON)
function exportarDados() {
  const dados = { atendimentos, clientes };
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_salao_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
}

function importarDados(e) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const dados = JSON.parse(event.target.result);
    if (dados.atendimentos && dados.clientes) {
      localStorage.setItem('atendimentos', JSON.stringify(dados.atendimentos));
      localStorage.setItem('clientes', JSON.stringify(dados.clientes));
      location.reload();
    } else {
      alert('Arquivo de backup inválido!');
    }
  };
  reader.readAsText(e.target.files[0]);
}