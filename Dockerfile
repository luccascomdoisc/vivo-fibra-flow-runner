# Imagem oficial da Apify: Node 20 + Playwright + Chromium ja instalados em /pw-browsers.
FROM apify/actor-node-playwright-chrome:20

# Descobre a versao do Playwright embutida na imagem ANTES de mexer no node_modules.
# O Chromium em /pw-browsers corresponde exatamente a essa versao; basta alinhar o npm
# a ela para evitar redownload (e o erro EACCES de escrita em /pw-browsers).
RUN node -p "require('playwright/package.json').version" > /tmp/pw_version.txt \
 && echo "Playwright embutido na imagem: $(cat /tmp/pw_version.txt)"

# Copia manifestos primeiro (aproveita cache de camada).
COPY --chown=myuser package*.json ./

# Fixa o Playwright do projeto na versao embutida e instala SEM baixar browsers
# (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1: o Chromium ja existe na imagem).
RUN PW=$(cat /tmp/pw_version.txt) \
 && npm --quiet set progress=false \
 && npm pkg set dependencies.playwright="$PW" \
 && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --omit=dev --omit=optional \
 && echo "Pacotes instalados:" \
 && (npm list --omit=dev --all || true) \
 && echo "Node:" && node --version \
 && echo "NPM:" && npm --version

# Copia o restante do codigo do Actor.
COPY --chown=myuser . ./

CMD ["node", "src/main.js"]
