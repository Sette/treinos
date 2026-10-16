# Operação e manutenção

## Rotina de publicação

1. Edite `Código.gs` ou `Index.html` no projeto Apps Script (ou sincronize os arquivos com o fluxo de desenvolvimento adotado).
2. Revise os escopos e a configuração de acesso no manifesto.
3. Atualize a implantação do tipo App da Web para disponibilizar uma versão nova.
4. Faça uma verificação manual da URL, login, abertura/criação de ficha, edição e salvamento.

## Rotina de catálogo

1. Adicione, remova, renomeie ou organize GIFs na pasta do Drive.
2. Execute `refreshCatalog()` no Apps Script.
3. Recarregue a página e confirme os filtros/grupos exibidos.

O cache é dividido em segmentos para respeitar o limite por valor do CacheService e tem validade de seis horas. A expiração pode ocorrer antes desse prazo; o app reconstrói o catálogo na próxima consulta.

## Funções administrativas no editor

| Função | Uso |
| --- | --- |
| `createWorkoutSpreadsheet()` | Cria a planilha inicial, configura sua propriedade e retorna a URL. Execute uma vez por instância. |
| `setWorkoutSpreadsheetId()` | Vincula uma planilha existente após substituir o ID de exemplo no código. |
| `generateInviteCode()` | Gera e substitui o código global de cadastro; o anterior deixa de valer. |
| `showInviteCode()` | Registra o código global atual no log de execução. |
| `setInviteCode()` | Define um código escolhido após substituir o valor de exemplo no código. |
| `refreshCatalog()` | Limpa e reconstrói o cache do catálogo. |
| `setRootFolderId()` | Valida o acesso à pasta configurada e atualiza o catálogo. |

Não execute `createWorkoutSpreadsheet()` novamente se pretende conservar a instância atual: ela cria outra planilha e troca o ID guardado nas propriedades do script.

## Cópia de segurança e migração

Faça cópias da planilha antes de alterações manuais ou migrações. As abas `Usuários`, `Treinos` e `Exercícios` são a fonte persistente para a experiência atual. Preservar a planilha e as propriedades do script é necessário ao transferir a instância. Após copiar o projeto, configure novamente os IDs e o código de convite, pois as propriedades do script pertencem a cada projeto.

## Diagnóstico rápido

| Sintoma | Verificações |
| --- | --- |
| Catálogo em branco | ID e permissões da pasta; formato GIF; execução de `refreshCatalog()`. |
| Ficha não persiste | Propriedade `WORKOUT_SPREADSHEET_ID`; abas e cabeçalhos; acesso da conta executora à planilha. |
| Convite não funciona | Código global atual e ausência de espaços; regenerar invalida o código antigo. |
| Login pede autenticação de novo | O cache da sessão expirou ou foi limpo; entrar novamente. |
| URL continua com versão anterior | Atualizar a implantação do web app. |
