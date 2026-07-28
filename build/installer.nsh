; build/installer.nsh
; Customização do instalador NSIS gerado pelo electron-builder.
;
; O electron-builder já cuida sozinho de:
;  - detectar o app em execução e pedir para fechar antes de continuar
;    (macro CHECK_APP_RUNNING, embutida em installSection.nsh);
;  - impedir duas instâncias do PRÓPRIO instalador rodando ao mesmo tempo
;    (ALLOW_ONLY_ONE_INSTALLER_INSTANCE);
;  - atualizar silenciosamente uma instalação já existente (desinstala a
;    versão antiga e instala a nova no mesmo diretório).
;
; O que falta — e é feito aqui via customInit — é: se já existe uma versão
; instalada, perguntar ao usuário se quer ATUALIZAR ou DESINSTALAR, e nunca
; permitir instalar uma versão mais antiga por cima de uma mais nova
; (downgrade). Isso também evita instalações duplicadas: ou atualiza no
; lugar da existente, ou desinstala, nunca cria uma cópia paralela.
;
; Em instalação silenciosa (/S, usada por auto-update) o downgrade continua
; bloqueado, mas a pergunta Atualizar/Desinstalar é pulada — não há ninguém
; para responder, então segue direto para atualizar.

!include "WordFunc.nsh"
!insertmacro VersionCompare

!macro customInit
  ReadRegStr $R7 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"

  ${if} $R7 != ""
    ${VersionCompare} "$R7" "${VERSION}" $R8
    ; $R8: 0 = mesma versão, 1 = instalada é mais nova, 2 = instalada é mais antiga

    ${if} $R8 == 1
      ; Downgrade: a versão instalada é mais recente que este instalador.
      ; Bloqueia sempre, mesmo em modo silencioso — auto-update nunca deve rebaixar a versão.
      MessageBox MB_ICONSTOP|MB_OK "Uma versão mais recente do ${PRODUCT_NAME} ($R7) já está instalada.$\r$\n$\r$\nEste instalador (${VERSION}) não pode fazer downgrade. Para reinstalar ou remover a versão atual, use a opção Desinstalar no Painel de Controle." /SD IDOK
      Quit
    ${elseif} ${Silent}
      ; Instalação silenciosa (ex.: auto-update): segue direto para atualizar.
    ${else}
      ; Mesma versão ou versão mais antiga instalada: oferece a escolha.
      ReadRegStr $R9 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "O ${PRODUCT_NAME} já está instalado (versão $R7).$\r$\n$\r$\nSIM = Atualizar para a versão ${VERSION}$\r$\nNÃO = Desinstalar$\r$\nCANCELAR = Sair do instalador" /SD IDYES IDYES customInit_update IDNO customInit_uninstall
        Quit

      customInit_uninstall:
        ${if} $R9 != ""
          ExecWait '$R9'
        ${endif}
        Quit

      customInit_update:
        ; Segue o fluxo normal do electron-builder, que desinstala a versão
        ; antiga e instala a nova no mesmo diretório.
    ${endif}
  ${endif}
!macroend
