# Ramifica para Android

Projeto [Capacitor](https://capacitorjs.com) que empacota o app web da pasta `../ramifica` como um app Android de verdade (APK).

O GitHub gera o APK sozinho a cada mudança em `ramifica/` ou `app-android/` (workflow `.github/workflows/ramifica-android.yml`) e publica em **Releases**.

O que é nativo:
- **Compartilhar › Ramifica** em qualquer app guarda o texto ou link num mapa (`MainActivity.java`).
- Atalhos no ícone: Captura rápida, Novo mapa e Último mapa (`res/xml/shortcuts.xml`).
- Exportar e anexos usam a folha de compartilhamento do Android; links abrem no navegador; o botão Voltar fecha painéis e janelas antes de sair.

A chave de assinatura não fica no repositório. O workflow lê do segredo `RAMIFICA_KEYSTORE_B64` (o arquivo .keystore em base64) e da senha em `RAMIFICA_KEYSTORE_PASSWORD`. Com a mesma chave, toda versão pode ser instalada por cima da anterior sem perder dados. Sem o segredo, o build usa uma chave temporária.

Para gerar localmente (precisa do Android SDK e Java 21):

```
npm ci
npm run sync
cd android && ./gradlew assembleRelease
```
