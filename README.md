# Treino em Movimento

Aplicação web para consultar uma biblioteca de exercícios com GIFs e montar fichas de treino semanais. O projeto usa Google Apps Script como aplicação e backend, Google Drive para os GIFs e Google Sheets para os dados.

## Funcionalidades

- Biblioteca de exercícios com pesquisa e filtro por grupo muscular.
- Pré-visualização dos movimentos em GIF.
- Cadastro por convite e login por e-mail e senha.
- Criação de várias fichas por usuário, organizadas de segunda a sábado.
- Edição de séries, repetições, carga, descanso e observações.
- Reordenação de exercícios por arrastar ou teclado, cópia entre dias e salvamento automático.
- Exportação da ficha como texto e envio pelo WhatsApp.
- Catálogo construído recursivamente a partir de uma pasta do Google Drive e mantido em cache.
- Script opcional para baixar GIFs de uma página web e organizá-los em pastas.

## Como funciona

`Index.html` contém a interface e chama as funções do servidor por `google.script.run`. `Código.gs` implementa o app web, autenticação, persistência das fichas e leitura/cache do catálogo do Drive. `appscript.json` define runtime, fuso horário, escopos e acesso do web app. `baixar_gifs.py` é uma ferramenta independente de importação de GIFs; não é necessário para executar o app.

O catálogo espera GIFs dentro de uma pasta do Drive. Subpastas são tratadas como grupos/categorias: os GIFs devem ter nomes legíveis e a árvore de pastas deve refletir como você quer agrupar os exercícios. Usuários e treinos são guardados nas abas `Usuários`, `Treinos` e `Exercícios` de uma planilha. A aba antiga `Ficha semanal` também é preparada para compatibilidade com o formato de ficha anterior.

## Publicar sua própria instância

1. Crie um projeto em [Google Apps Script](https://script.google.com/) e adicione os arquivos `Código.gs` e `Index.html` com esses nomes. O arquivo HTML deve se chamar `Index`, sem a extensão no nome usado pelo Apps Script.
2. Copie as configurações de `appscript.json` para o manifesto do projeto (ative a exibição do manifesto nas configurações, se necessário). Revise os escopos e as opções de acesso conforme a política da sua organização.
3. No Drive, crie ou escolha uma pasta com os GIFs. Compartilhe a pasta com a conta que implantará o Apps Script. Atualize `SETTINGS.ROOT_FOLDER_ID` no início de `Código.gs` com o ID dessa pasta.
4. No editor do Apps Script, execute `createWorkoutSpreadsheet()` uma vez e autorize o acesso solicitado. A função cria a planilha e grava seu ID nas propriedades do script. Se preferir uma planilha existente, informe o ID em `setWorkoutSpreadsheetId()` e execute essa função em vez da criação.
5. Execute `generateInviteCode()` e consulte o registro de execução para obter o código. Compartilhe-o apenas com as pessoas que poderão criar conta. `showInviteCode()` mostra o código atual sem alterá-lo. `setInviteCode()` permite definir um código escolhido: edite o valor de exemplo no código antes de executar.
6. Execute `refreshCatalog()` para testar o acesso à pasta e gerar o catálogo inicial. Repita após adicionar, remover ou renomear GIFs.
7. Em **Implantar > Nova implantação**, escolha **App da Web**. Selecione a identidade de execução apropriada. O manifesto incluído executa como a pessoa que implantou e permite acesso anônimo à URL; nesse modo, as chamadas ao Sheets e ao Drive usam as permissões do implantador. Restrinja quem pode abrir a URL ou ajuste o acesso se a instância não for pública.
8. Abra a URL da implantação e teste a biblioteca, cadastro com convite, criação de treino e persistência. Ao publicar alterações, crie uma nova versão/implantação conforme o fluxo do Apps Script.

> A pasta do Drive e a planilha são recursos da sua instância. Não use IDs de recursos de outra pessoa sem autorização. Não coloque senhas, cookies ou códigos privados no repositório.

## Uso

1. Abra a implantação e navegue pela biblioteca; pesquise por nome ou filtre por grupo muscular.
2. Entre ou crie uma conta usando o código de convite vigente. A senha deve ter pelo menos seis caracteres.
3. Abra **Minha semana**, crie ou selecione uma ficha e adicione exercícios aos dias.
4. Preencha os campos desejados. As alterações são salvas automaticamente; o status da tela indica o resultado.
5. Use a seta/controle de arrastar para ordenar os movimentos, ou o teclado nas alças de ordenação. Copie um dia para outro pelo seletor.
6. Use **Exportar treino** para copiar o texto ou abrir o compartilhamento no WhatsApp.
7. **Excluir treino** arquiva a ficha: ela deixa de aparecer no app, mas os registros continuam na planilha.

## Estrutura dos dados

| Aba | Conteúdo |
| --- | --- |
| `Usuários` | ID, e-mail, nome, papel, hash e salt da senha, datas de criação e acesso. |
| `Treinos` | ID, proprietário, nome, status, datas e descrições dos dias. |
| `Exercícios` | Exercícios e métricas por treino, dia e ordem. |
| `Ficha semanal` | Estrutura legada de uma ficha; mantida para compatibilidade. |

As abas de uso atual são criadas automaticamente quando necessário. Evite mudar seus cabeçalhos ou apagar linhas diretamente sem fazer uma cópia de segurança.

## Atualização do catálogo

O catálogo é obtido ao percorrer a pasta configurada no Drive. O segundo nível da árvore determina o grupo; o caminho relativo é apresentado como pasta. Após mudanças nos arquivos, execute `refreshCatalog()` no editor do Apps Script para invalidar o cache e reconstruí-lo. O cache expira em seis horas.

### Baixar GIFs com Python (opcional)

Requer Python 3. O script usa apenas a biblioteca padrão para páginas estáticas. Para páginas que renderizam conteúdo com JavaScript, instale Playwright e Chromium:

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

Exemplos:

```bash
python3 baixar_gifs.py --help
python3 baixar_gifs.py --url 'https://exemplo.com/gifs' --saida ./gifs
python3 baixar_gifs.py --url 'https://exemplo.com/gifs' --saida ./gifs --cookie-arquivo ./cookie.txt
```

O arquivo de cookie é opcional e deve conter o valor do cabeçalho `Cookie` de uma sessão autorizada. Trate-o como segredo, não o publique nem o adicione ao Git. Os downloads são organizados em subpastas por categoria; copie os arquivos para a pasta do Drive configurada e atualize o catálogo.

## Solução de problemas

- **Erro de autorização do Drive/Sheets:** execute novamente a função necessária no editor e conceda acesso à conta de implantação; confirme que essa conta acessa a pasta e a planilha.
- **Catálogo vazio ou desatualizado:** confira `ROOT_FOLDER_ID`, permissões e se os arquivos são GIFs; execute `refreshCatalog()`.
- **Não é possível criar conta:** configure um convite com `generateInviteCode()` ou `setInviteCode()` e use exatamente o código vigente.
- **Sessão expirada:** faça login novamente. As sessões ficam no cache por até seis horas e podem expirar antes.
- **Treinos não salvam:** confira se `WORKOUT_SPREADSHEET_ID` existe nas propriedades do script e se a conta executora ainda tem acesso à planilha.
- **Mudanças no código não aparecem:** atualize a implantação do web app para uma versão que inclua as alterações.

## Privacidade e limites

O projeto usa a planilha vinculada para armazenar dados da conta e do treino. A autenticação e as sessões são implementadas no próprio Apps Script; a sessão fica em cache por seis horas. O código atual aplica SHA-256 com salt às senhas e usa um código de convite global. Antes de usar com dados sensíveis ou em escala, avalie se esses controles e os escopos/acesso do Apps Script atendem às exigências do seu contexto. A exportação é feita no navegador e o salvamento automático ocorre após uma breve pausa na edição.

## Licença

Nenhuma licença foi definida neste repositório. Até que uma licença seja adicionada, não presuma que o código possa ser redistribuído ou reutilizado livremente.
