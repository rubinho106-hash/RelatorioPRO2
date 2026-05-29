# Auditoria Arquitetural — RelatorioPRO

**Data:** 2026-05-29
**Branch:** main
**HEAD local:** `f6bc79d`
**Origin:** github.com/rubinho106-hash/RelatorioPRO2
**Foco:** mapa estrutural, dependências, dívidas técnicas e roadmap de estabilização.

---

## 1. Estrutura de diretórios

```
D:\dev\RelatorioPRO\
├── .git\                ← repositório Git
├── .vscode\             ← tasks: extract_ifc, analytics, grouping
├── CLAUDE.md            ← guia de arquitetura mantido
├── .gitignore
│
├── archive\             ← código antigo + profiler ainda referenciado (!)
│   ├── relatorio_pro.rb (88 KB, 2346 linhas — versão monolítica anterior)
│   └── profiling\profiler.js (carregado por dialog.html via ../archive)
│
├── python\              ← pipeline de processamento (3 scripts ativos + 2 vazios)
│   ├── extract_ifc.py  (ifcopenshell → json/elements.json)
│   ├── grouping.py     (elements → groups.json)
│   ├── analytics.py    (elements → summary.json)
│   ├── export.py       ⚠ VAZIO (0 bytes)
│   ├── geometry.py     ⚠ VAZIO (0 bytes)
│   ├── Untitled-1.html ⚠ lixo
│   ├── Untitled-1.js   ⚠ lixo
│   ├── csv\ data\ json\ temp\  ← workdirs locais (redundantes com top-level)
│
├── ruby\                ← extensão SketchUp
│   ├── relatorio_pro.rb (866 linhas — orquestrador atual)
│   ├── python_bridge.rb (Open3 → scripts Python)
│   ├── ui.rb            (37 linhas — quase vazio)
│   ├── observers.rb     ⚠ VAZIO (0 bytes)
│   └── bim\
│       ├── resolver.rb         (91 linhas)
│       ├── selection_engine.rb (51 linhas)
│       └── visibility_engine.rb (75 linhas)
│
├── ui\                  ← dashboard HTML/JS/CSS (sem build, servido cru)
│   ├── dialog.html      (2714 linhas — HTML+CSS inline + script tags)
│   ├── css\             (Modus design system + styles.css)
│   ├── design\          (tokens.css + components/* — design system novo, paralelo a css/)
│   ├── components\      (1 arquivo só: system.css)
│   ├── images\
│   ├── languages\       (language.js + status — pt fixo)
│   └── js\
│       ├── core\        ← Foundation Layer (state, eventBus, schemaRegistry, renderManager, kpiEngine, contracts...)
│       ├── services\    ← Bridge, dataLoader (carregados em produção)
│       ├── legacy\      ← adapter.js (sincroniza globals window.currentMode etc. com AppState)
│       ├── dashboard\   ← kpiCards, breadcrumb, sidebar, details (carregados em produção)
│       ├── contracts\   ← validação de payload dos módulos UI
│       │
│       ├── info.js              ⚠⚠⚠ MEGA-MONOLITO 3912 LINHAS
│       ├── edit-table.js        (988 linhas)
│       ├── export-excel.js      (698 linhas — SheetJS bundle separado)
│       ├── settings.js
│       ├── ui-shims.js
│       │
│       ├── app\         ← bootstrap ESM (parcialmente preenchido)
│       ├── state\       ← AppState/queryState/tableState/selectionState/layoutState (ESM, parcial)
│       ├── kpi\         ← stubs de 5 linhas
│       ├── query\       ← stubs de 5 linhas
│       ├── render\      ← stubs de 5 linhas
│       ├── viewmodels\  ← stubs de 8 linhas
│       ├── views\       ← tableWorkspaceView (49 linhas, em construção) + 4 stubs
│       ├── table\       ← stubs de 5 linhas
│       ├── bridge\      ← stubs de 5 linhas (paralelo a services/bridge.js já ativo)
│       └── renderers\   ← semanticInspectorRenderer, workspaceHeaderRenderer (reais)
│
├── csv\ json\ logs\ temp\ docs\ tests\  ← workdirs e diretórios pendentes
```

**Total auditado:** 218 dirs, 374 arquivos, 2,98 MB (excluindo `.git`).

---

## 2. Mapa de módulos JavaScript

### 2.1 Camada de Produção (carregada por `ui/dialog.html`)

Ordem de carregamento literal (linhas 2739–3105 de `ui/dialog.html`):

| # | Arquivo | Tamanho | Papel |
|---|---|---|---|
| 1 | `ui/js/ui-shims.js` | 5 KB | Polyfills |
| 2 | `ui/js/xlsx.full.min.js` | (bundle) | SheetJS (export Excel) |
| 3 | `ui/languages/language-status.js` | <1 KB | i18n status |
| 4 | `ui/languages/language.js` | 1 KB | i18n (fixo pt) |
| 5 | `ui/js/core/state.js` | 8.5 KB | **AppState singleton** |
| 6 | `ui/js/core/layoutState.js` | 1.4 KB | Estado de layout |
| 7 | `ui/js/core/viewRegistry.js` | 2.1 KB | Registry de views |
| 8 | `ui/js/core/eventBus.js` | 6.2 KB | **EventBus pub/sub** |
| 9 | `ui/js/services/bridge.js` | 6.7 KB | **Bridge → window.sketchup** |
| 10 | `ui/js/core/kpiEngine.js` | 7.5 KB | Cálculo puro de KPIs |
| 11 | `ui/js/core/schemaRegistry.js` | 13.6 KB | **BIMSchemaRegistry** |
| 12 | `ui/js/core/renderManager.js` | 32 KB / 729 linhas | Orquestração de render |
| 13 | `ui/js/legacy/adapter.js` | 3.1 KB | Proxies globais ↔ AppState |
| 14 | `ui/js/core/quickCheck.js` | 6.4 KB | Smoke tests |
| 15 | **`../archive/profiling/profiler.js`** | 15 KB | ⚠ caminho fora de `ui/` |
| 16 | `ui/js/contracts/dashboard.contracts.js` | 13 KB | Validação de payload |
| 17 | `ui/js/dashboard/kpiCards.js` | 11 KB | KPICardsModule |
| 18 | `ui/js/dashboard/breadcrumb.js` | 6.4 KB | BreadcrumbModule |
| 19 | `ui/js/dashboard/sidebar.js` | 8.1 KB | SidebarModule |
| 20 | `ui/js/dashboard/details.js` | 15 KB | DetailsModule |
| 21 | `ui/js/services/dataLoader.js` | 8.7 KB | Fetch JSON + bootstrap |
| 22 | **`ui/js/info.js`** | **160 KB / 3912 linhas** | ⚠⚠⚠ Monolito legado |
| 23 | `ui/js/edit-table.js` | 35 KB | Edição inline da tabela |
| 24 | `ui/js/settings.js` | 8.4 KB | Modal de settings |
| 25 | `ui/js/export-excel.js` | 32 KB | Geração de .xlsx |
| 26 | `<script type=module>` → `ui/js/app/bootstrap.js` | 11.8 KB | ESM entry (parcial) |

Tudo de 1–25 é **IIFE/globals**; o item 26 é o único ponto ESM.

### 2.2 Camada Aspiracional (ESM, mostly stubs)

São arquivos que existem mas o pipeline IIFE não usa. Estão sendo gradualmente "puxados" pelo bootstrap ESM. Estado real:

| Pasta | Reais | Stubs (5 linhas) | Observação |
|---|---|---|---|
| `app/` | bootstrap.js (271 l.), runtime.js, lifecycle.js | — | Bootstrap tem 5 TODOs internos |
| `state/` | queryState (117 l.), tableState (119 l.), selectionState (113 l.), layoutState (85 l.) | appState.js | `appState.js` aqui é stub; o real é `core/state.js` |
| `views/` | tableWorkspaceView (49 l.), workspaceViewResolver (21 l.) | dashboard/detail/empty/query (12–18 l.) | tableWorkspaceView referencia `window.semanticTableRenderer` que não existe |
| `renderers/` | semanticInspectorRenderer (82 l.), workspaceHeaderRenderer (51 l.), buildWorkspaceHeaderViewModel (77 l.) | — | Reais e wireados |
| `inspectorState.js` (raiz js/) | 101 linhas | — | Real |
| `kpi/`, `query/`, `render/`, `viewmodels/`, `table/`, `bridge/` | **0** | **TODOS** stubs (5 linhas, `// TODO: Implementar...`) | **Código morto** |

### 2.3 Duplicação detectada (módulos com o mesmo nome em pastas diferentes)

| Nome | Versão em uso | Versão fantasma |
|---|---|---|
| `state.js` / `appState.js` | `core/state.js` (real, 275 l.) | `state/appState.js` (stub 6 l.) |
| `kpiEngine.js` | `core/kpiEngine.js` (real, 239 l.) | `kpi/kpiEngine.js` (stub 5 l.) |
| `kpiCards.js` | `dashboard/kpiCards.js` (real, 278 l.) | `kpi/kpiCards.js` (stub 5 l.) |
| `layoutState.js` | `core/layoutState.js` (real, 33 l.) | `state/layoutState.js` (real, 85 l. — concorrente!) |
| `renderManager.js` | `core/renderManager.js` (real, 729 l.) | `render/renderManager.js` (stub 5 l.) |
| `bridge.js` | `services/bridge.js` (real, 216 l.) | `bridge/bridge.js` (stub 5 l.) |

---

## 3. Mapa de módulos Ruby

```
ruby/relatorio_pro.rb (866 linhas) ← ÚNICO entry-point registrado pela extensão
   │
   ├── require_relative "python_bridge"  → executa scripts Python via Open3
   ├── require_relative "ui"             → 37 linhas, quase vazio (provavelmente helpers ou stub)
   ├── require_relative "bim/resolver"          → resolve IFC types/tags
   ├── require_relative "bim/selection_engine"  → seleção bidirecional
   └── require_relative "bim/visibility_engine" → controle de visibilidade
```

`observers.rb` está vazio mas `relatorio_pro.rb` define internamente `DashboardSelectionObserver` (visto na leitura).

Fluxo de dados Ruby ↔ Python ↔ UI:

```
SketchUp Model
  ↓ (observer)
RelatorioPRO.handle_sketchup_selection_change
  ↓
PythonBridge.run_full_pipeline (Open3)
  ↓
extract_ifc.py → elements.json
grouping.py    → groups.json
analytics.py   → summary.json
  ↓
HtmlDialog.execute_script → window.updateData()
  ↓
RelatorioDataLoader → EventBus.emit(DATA_LOADED)
```

---

## 4. Mapa de módulos Python

| Script | Linhas | Função | Imports |
|---|---|---|---|
| `extract_ifc.py` | 71 | Parse de .ifc → `elements.json` | `ifcopenshell`, `json`, `sys`, `pathlib` |
| `grouping.py` | 24 | Agrupa elements → `groups.json` | `json`, `collections.defaultdict`, `pathlib` |
| `analytics.py` | 20 | KPIs globais → `summary.json` | `json`, `collections.Counter`, `pathlib` |
| **`export.py`** | 0 | ⚠ Vazio | — |
| **`geometry.py`** | 0 | ⚠ Vazio | — |

**Não há cross-imports entre scripts Python.** Cada um é independente e se comunica via arquivos JSON. Dependência externa única e relevante: `ifcopenshell`.

---

## 5. Dependências entre módulos (grafo simplificado)

```
                        ┌──────────────────┐
                        │  dialog.html     │
                        │  (script order)  │
                        └────────┬─────────┘
                                 │
        ┌────────────────────────┴──────────────────────┐
        ▼                                               ▼
   AppState (core/state.js)                         EventBus (core/eventBus.js)
        ▲                                               ▲
        │  ┌────────────────────────────────────────────┘
        │  │
   ┌────┴──┴──────────────────────────────────┐
   │ LegacyAdapter (proxia window.currentMode, currentTag, currentElement → AppState)
   └────────────────────────────────────────────┘
        ▲
        │  (leitura/escrita)
        │
   ┌────┴─────────────────────────────────────────────────┐
   │ info.js (3912 linhas)                                │
   │   • Faz 14 chamadas window.sketchup.* DIRETAS ❌     │
   │   • Define window.tagModel, relatorioTagDashboard,   │
   │     relatorioIfcSummary, updateData                  │
   │   • Emite/escuta 13 EventBus events                  │
   │   • Manipula DOM direto                              │
   └──────────────────────────────────────────────────────┘
        ▲                       ▲                      ▲
        │                       │                      │
   kpiCards   breadcrumb   sidebar   details   edit-table   settings   export-excel
   (lê AppState + escuta EventBus)
        ▲
        │
   Bridge (services/bridge.js)
        ▲
        │
   window.sketchup (SketchUp HtmlDialog)
        ▲
        │
   Ruby relatorio_pro.rb
        │
        ▼
   PythonBridge (Open3) → extract_ifc.py / grouping.py / analytics.py
```

---

## 6. Principais pontos de acoplamento

| Ponto | Evidência | Severidade |
|---|---|---|
| **info.js como super-hub** | 3912 linhas, 13 usos de EventBus, 14 acessos a `window.sketchup`, define 4 globais críticos | 🔴 Crítica |
| **Globais `window.tagModel` / `relatorioTagDashboard` / `relatorioIfcSummary`** | Escritos em info.js, lidos em export-excel.js e kpiCards/details. Sem schema/contract. | 🟠 Alta |
| **`window.sketchup` direto** | CLAUDE.md proíbe; info.js, settings.js e dialog.html quebram a regra | 🟠 Alta |
| **Carregamento de `../archive/profiling/profiler.js`** | dialog.html linha 3093 puxa do diretório de arquivo histórico | 🟡 Média |
| **Duas pastas de design system** (`css/`, `design/`) e dois conjuntos de módulos (`core/`+`dashboard/` vs `state/`+`kpi/`+`view/`) | Decisão arquitetural não finalizada | 🟡 Média |
| **EventBus parcialmente adotado** | 42 ocorrências em 11 arquivos, mas info.js domina (13 = 31% delas) | 🟡 Média |
| **Ruby `relatorio_pro.rb` orquestrador único** | 866 linhas tocando observers, bridges, pipeline, settings, comandos | 🟠 Alta |

---

## 7. Arquivos mais críticos (load-bearing — se quebrarem, a aplicação para)

| Arquivo | Por que é crítico |
|---|---|
| `ruby/relatorio_pro.rb` | Único entry-point Ruby; orquestra observers + ponte Python + diálogo |
| `ui/dialog.html` | Define ordem de carregamento JS, layout DOM base e bootstrap ESM |
| `ui/js/core/state.js` | AppState é fonte única de verdade |
| `ui/js/core/eventBus.js` | Toda comunicação inter-módulo passa aqui |
| `ui/js/services/bridge.js` | Abstrai SketchUp; sem isso, dashboard fica offline-only |
| `ui/js/services/dataLoader.js` | Sem ele, não há dados |
| `ui/js/info.js` | Renderiza tabela principal e mantém modelos globais |
| `ui/js/core/renderManager.js` | Sincroniza estado → UI; debounce de render |
| `ui/js/contracts/dashboard.contracts.js` | Strict mode habilitado: contract failure crasha módulo |
| `ruby/python_bridge.rb` | Sem ele, pipeline Python não roda |

---

## 8. Arquivos com maior risco técnico

| Arquivo | Risco | Motivo |
|---|---|---|
| `ui/js/info.js` (3912 l.) | 🔴 Extremo | Tamanho, acoplamento direto a `window.sketchup`, dono de globais, DOM mixado com lógica |
| `ui/dialog.html` (2714 l.) | 🔴 Alto | HTML + CSS + JS inline misturados; ordem de scripts frágil; depende de `../archive/` |
| `archive/relatorio_pro.rb` (2346 l.) | 🟠 Alto-confusional | Versão antiga preservada; risco de alguém editar a errada |
| `ui/js/core/renderManager.js` (729 l.) | 🟡 Médio | Lógica complexa de debounce/queue; sem testes |
| `ui/js/edit-table.js` (988 l.) | 🟡 Médio | Operações de edição inline; sem contratos |
| `ui/js/export-excel.js` (698 l.) | 🟡 Médio | Depende de globais não-tipados (`window.tagModel`, etc.) |
| `ruby/relatorio_pro.rb` (866 l.) | 🟡 Médio | Sem split por responsabilidade |
| Stubs em `state/`, `kpi/`, `query/`, `render/`, `bridge/`, `viewmodels/`, `table/` | 🟠 Conceitual | 30+ arquivos com `// TODO: Implementar…` — confundem leitor e nunca executam |
| `python/export.py`, `python/geometry.py`, `ruby/observers.rb` | 🟡 Falso-positivo | Vazios mas nomeados como se existissem |
| `python/Untitled-1.html`, `python/Untitled-1.js` | 🟢 Baixo | Lixo a deletar |
| `python/csv/`, `python/data/`, `python/json/`, `python/temp/` | 🟡 Médio | Duplicam diretórios top-level; risco de path divergente |
| Caminho `../archive/profiling/profiler.js` em dialog.html | 🟠 Alto | Quebra se `archive/` for movido; viola encapsulamento |

---

## 9. Arquivos por tamanho e complexidade aproximada

Top 12 (excluindo `xlsx.full.min.js`):

| Linhas | KB | Arquivo |
|---|---|---|
| 3912 | 160 | ui/js/info.js |
| 2714 | 87 | ui/dialog.html |
| 2346 | 88 | archive/relatorio_pro.rb |
| 988 | 36 | ui/js/edit-table.js |
| 866 | 30 | ruby/relatorio_pro.rb |
| 729 | 32 | ui/js/core/renderManager.js |
| 698 | 32 | ui/js/export-excel.js |
| 489 | 15 | ui/js/dashboard/details.js |
| 445 | 15 | archive/profiling/profiler.js |
| 402 | 13 | ui/js/contracts/dashboard.contracts.js |
| 305 | 12 | ui/js/core/test-integration.js |
| 278 | 11 | ui/js/dashboard/kpiCards.js |

Marcadores de débito: **38 TODO/FIXME/HACK** no código vivo (excluindo `xlsx.full.min.js`), concentrados nos stubs ESM e em `app/bootstrap.js` (5 TODOs).

---

## 10. Roadmap de estabilização sugerido

Ordenado por **maior alívio de risco por menor esforço primeiro**.

### Fase 0 — Higiene (1 sessão, sem refatorar)

- [ ] Apagar `python/Untitled-1.html`, `python/Untitled-1.js`.
- [ ] Apagar (ou documentar) `python/export.py`, `python/geometry.py`, `ruby/observers.rb` vazios.
- [ ] Consolidar `python/csv` `python/data` `python/json` `python/temp` com os top-level (decidir uma fonte canônica) e atualizar caminhos nos scripts.
- [ ] Mover `archive/profiling/profiler.js` para `ui/js/devtools/profiler.js` e atualizar `dialog.html` (elimina o `../archive/` mágico).
- [ ] Adicionar `archive/` ao `.gitignore` ou mover para uma branch `legacy/`.

### Fase 1 — Acabar a migração ESM ou abortar (1–2 sessões)

A coexistência de IIFE (em produção) com ESM (em stubs) é o maior gerador de confusão. **Escolher um caminho:**

- **A. Manter IIFE como produção** → remover `app/bootstrap.js` do `<script type=module>` em dialog.html; apagar pastas `state/appState.js`, `kpi/`, `query/`, `render/`, `viewmodels/`, `table/`, `bridge/`. Deixar só `core/`, `services/`, `dashboard/`, `contracts/`, `legacy/`.
- **B. Concluir migração ESM** → terminar bootstrap.js (5 TODOs), promover `state/`+`kpi/`+`view/` a reais, e remover progressivamente as cópias IIFE em `core/`.

Recomendação: **opção A** primeiro (limpeza barata), iniciar **B** depois com escopo claro e por módulo.

### Fase 2 — Reforçar a Bridge (1–2 sessões)

- [ ] Auditar e eliminar os 14 `window.sketchup.*` diretos em `info.js`, `settings.js` e `dialog.html`.
- [ ] Cobrir cada chamada por um método em `services/bridge.js` (`Bridge.selectElement`, `Bridge.focusCamera`, etc.).
- [ ] Adicionar `Bridge.assertAvailable()` para guardar entradas em runtime.

### Fase 3 — Descomissionar `info.js` por fatias (3–5 sessões)

`info.js` (3912 l.) é o maior risco. Não dá pra reescrever de uma vez. Sugestão de fatiamento incremental:

1. Extrair os 3 builders de modelo (`buildSimpleTagModel`, `tagDashboardModel`, `ifcSummary`) para `ui/js/models/*.js` com testes de snapshot.
2. Extrair render da tabela principal para `ui/js/render/tableRenderer.js` (hoje stub).
3. Extrair handlers de evento para `ui/js/events/*.js` plugados no EventBus.
4. Cada vez que algo sair, removê-lo de info.js no mesmo commit.

### Fase 4 — Modularizar Ruby (2 sessões)

- [ ] Quebrar `ruby/relatorio_pro.rb` (866 l.) em módulos: `commands.rb`, `dialog.rb`, `observer.rb`, `live_refresh.rb`, `settings.rb`.
- [ ] Preencher `ruby/observers.rb` ou apagá-lo.
- [ ] Mover `DashboardSelectionObserver` para `ruby/observers.rb`.

### Fase 5 — Cobertura de testes (contínua)

- [ ] Habilitar smoke real: rodar `IntegrationTest.runAll()` ao salvar (algum gatilho via `tests/`).
- [ ] Adicionar test fixture de IFC pequeno em `tests/fixtures/` e fazer os 3 scripts Python rodarem end-to-end em CI quando o repo for pra GitHub Actions.
- [ ] Snapshot dos modelos `tagDashboardModel` para detectar drift.

### Fase 6 — Documentação viva (1 sessão)

- [ ] Atualizar `CLAUDE.md` com o estado real pós-Fase 1–4.
- [ ] Adicionar `docs/ARCHITECTURE.md` com diagrama de blocos.
- [ ] Adicionar `docs/MIGRATIONS.md` listando o que foi consolidado.

---

## Resumo executivo

O projeto está em **migração arquitetural não concluída**, com duas camadas convivendo: a antiga **IIFE/window-globals** (produção, funcional, mas com `info.js` como monolito de 4k linhas) e a nova **ESM modular** (parcialmente esboçada, em sua maioria stubs `// TODO`). O risco maior é cognitivo — alguém lendo o repo pela primeira vez encontra 30+ módulos `state/`, `kpi/`, `query/` que parecem importantes mas não rodam. Higienizar (Fase 0–1) já elimina ~70% da confusão; descomissionar `info.js` por fatias (Fase 3) é o trabalho longo mas inevitável.
