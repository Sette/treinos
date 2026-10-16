# Arquitetura

## Componentes

```text
Navegador
  ├── Index.html: biblioteca, editor de fichas e autenticação
  └── google.script.run
       └── Código.gs (Apps Script)
            ├── Google Drive: pasta e catálogo de GIFs
            ├── CacheService: catálogo e sessões temporárias
            └── Google Sheets: usuários, treinos e exercícios

baixar_gifs.py ──> arquivos GIF locais ──> pasta do Google Drive
```

## Fluxos principais

### Carregamento do catálogo

O navegador chama `getCatalog()`. O servidor tenta ler o catálogo dividido em partes no cache de script. Se não estiver disponível, percorre a pasta e suas subpastas no Drive, inclui apenas arquivos GIF, monta nome, grupo, caminho e URLs e grava o resultado no cache. `refreshCatalog()` invalida as partes guardadas e força reconstrução.

### Conta e sessão

O cadastro valida nome, formato do e-mail, senha mínima de seis caracteres e o código de convite global. O servidor grava o usuário na aba `Usuários`, com hash SHA-256 calculado usando salt. Login compara o hash informado com o armazenado. Uma sessão com token aleatório fica no cache por 21.600 segundos (seis horas); as funções protegidas verificam esse token antes de operar.

### Ficha de treino

Cada usuário pode manter várias fichas. `Treinos` relaciona a ficha ao proprietário e mantém seu status. `Exercícios` guarda cada exercício por ficha, dia e ordem, além de métricas e observações. A tela agenda o salvamento após aproximadamente 900 ms sem novas alterações. Arquivar a ficha muda seu status para `Arquivado`; o conteúdo não é apagado.

## Configuração e implantação

`appscript.json` define runtime V8, fuso `America/Sao_Paulo`, logging no Stackdriver, escopos de leitura do Drive e edição do Sheets, e o web app executado pela pessoa implantadora com acesso `ANYONE_ANONYMOUS`. Essa configuração torna a URL acessível sem login Google; o app oferece sua própria tela de conta, enquanto as operações de armazenamento são executadas com os privilégios do implantador. Revise a configuração antes de uma implantação pública.

IDs e propriedades:

- `SETTINGS.ROOT_FOLDER_ID`: constante com a pasta de mídia no Drive.
- `WORKOUT_SPREADSHEET_ID`: propriedade de script configurada por `createWorkoutSpreadsheet()` ou `setWorkoutSpreadsheetId()`.
- `INVITE_CODE`: propriedade global definida por `generateInviteCode()` ou `setInviteCode()`.

## Contrato do catálogo

Cada exercício servido ao navegador tem `id`, `name`, `group`, `folder`, `gifUrl`, `previewUrl` e `thumbnailUrl`. O ID é o ID do arquivo no Drive. O grupo corresponde à pasta logo abaixo da raiz (ou à raiz se não houver subpasta). Os GIFs precisam estar acessíveis à conta que executa o script.

## Ferramenta de importação

`baixar_gifs.py` percorre páginas/categorias de uma origem HTTP, identifica arquivos GIF em HTML estático e, quando disponível, em conteúdo renderizado pelo Chromium via Playwright. Os arquivos são nomeados com base no rótulo/URL e agrupados em diretórios. A ferramenta não interage com Apps Script, Drive ou Sheets; o envio para o Drive é uma etapa manual.
