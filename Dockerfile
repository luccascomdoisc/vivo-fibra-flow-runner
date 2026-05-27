# Base oficial da Apify com Node 20 + Playwright + Chromium ja instalados.
# A versao do Playwright no package.json deve ser compativel com a desta imagem;
# se o build acusar mismatch de browser, alinhar o caret do playwright ao da imagem.
FROM apify/actor-node-playwright-chrome:20

# Copia manifestos primeiro para aproveitar cache de camada.
COPY --chown=myuser package*.json ./

# Instala apenas dependencias de producao e garante o Chromium da versao
# instalada do Playwright (idempotente; evita mismatch de browser no build).
RUN npm --quiet set progress=false \
 && npm install --omit=dev --omit=optional \
 && npx playwright install chromium \
 && echo "Pacotes instalados:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node:" && node --version \
 && echo "NPM:" && npm --version

# Copia o restante do codigo do Actor.
COPY --chown=myuser . ./

CMD ["node", "src/main.js"]
