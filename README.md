# VERTIGO — Alpine Flight

Jogo de BASE jump e wingsuit em HTML, CSS e JavaScript com Three.js 0.180.0. O cenário é uma interpretação procedural dos Alpes, inspirada no voo no Monte Emilius mencionado na referência; não é uma reconstrução geográfica.

## Jogar

▶️ **[Jogue agora no navegador](https://dliedke.github.io/vertigo/)**

## Jogar localmente

No Windows, extraia o ZIP e execute **JOGAR.cmd** com o Node.js instalado.

Em qualquer sistema com Node.js:

```bash
node server.mjs
```

Abra **http://localhost:8080**. Não abra index.html diretamente pelo explorador de arquivos: os módulos JavaScript precisam ser servidos por HTTP.

Outra opção, com Python instalado:

```bash
python -m http.server 8080 --directory dist
```

Não é necessário instalar pacotes. Three.js e as fontes estão incluídos em `dist`. O jogo não faz requisições a CDNs durante a execução.

## Objetivo e controles

Atravesse os sete arcos, abra o paraquedas e pouse no alvo ao lado do rio. Arcos centrais rendem pontos extras; sequências, voo próximo ao terreno e um pouso preciso aumentam a pontuação. O recorde é salvo somente neste navegador.

| Controle | Ação |
| --- | --- |
| W / seta para cima | Mergulhar, ganhar velocidade e aumentar a descida |
| S / seta para baixo | Planar, reduzir a velocidade e a descida |
| A/D ou setas laterais | Virar |
| Shift | Mergulho rápido |
| Espaço | Abrir paraquedas; depois, segurar para frear |
| C | Alternar primeira e terceira pessoa |
| P / Esc | Pausar |
| R | Reiniciar o salto |
| M | Alternar áudio |

No celular, use o controle virtual à esquerda. Arraste para cima para mergulhar, para baixo para planar e para os lados para virar. Toque em **Abrir paraquedas**; depois, segure **Frear** para reduzir a velocidade. É possível abrir as configurações durante o voo.

A assistência de pouso, ativada por padrão, abre o paraquedas abaixo de 170 metros do terreno depois dos quatro primeiros segundos. Ela não dirige nem garante o pouso. No final, alinhe com o alvo, nivele as asas e segure espaço perto do solo. Curvas fortes durante o contato podem derrubar o personagem.

## Rotas

- **Monte Emilius:** arcos maiores, vento leve, exploração.
- **Aresta do vento:** arcos menores, uma linha lateral mais técnica, multiplicador de 1,5.
- **Última luz:** luz de fim de tarde, mais vento, multiplicador de 2.

As três rotas usam o mesmo vale com trajetórias, iluminação e dificuldade diferentes.

## Estrutura

- `dist/index.html`: interface, menus, instrumentos e diálogos acessíveis.
- `dist/styles.css`: composição, tipografia, responsividade e controles de toque.
- `dist/game.js`: ciclo do jogo, entrada, HUD, áudio sintetizado, placar local e integração WebMCP opcional.
- `dist/physics.js`: física em passos fixos, terreno, colisões, passagem pelos arcos e pontuação.
- `dist/world.js`: cenário, montanhas, floresta com 5.700 árvores instanciadas, rio animado, personagem, canopy, linhas, efeitos e câmeras.
- `dist/vendor`: Three.js e licença MIT.
- `dist/fonts`: fontes Barlow Condensed e DM Sans.
- `server.mjs`: servidor local sem dependências.
- `tests/flight.test.js`: testes determinísticos de voo, passagem por arcos, colisões e pouso.

## Verificação

```bash
npm run check
npm test
```

Os testes incluem pilotos simulados que atravessam os sete arcos e pousam perto do alvo em cada rota, usando a mesma física do jogador. A geometria e as chamadas de câmera também foram verificadas em execução sem renderizador. Uma inspeção visual em um navegador real não foi executada no ambiente de criação. A API WebMCP é detectada antes do registro, e sua validação em um navegador compatível ficou pendente.

Requer WebGL 2 com aceleração gráfica. Em dispositivos lentos, escolha **Desempenho** em configurações. Navegadores podem exigir interação para liberar áudio; use o botão de som.

## Tecnologia e licenças

O cenário, o personagem e os efeitos são gerados pelo código. Não há modelos ou texturas remotos. Three.js é distribuído sob licença MIT, incluída em `dist/vendor/THREE-LICENSE.txt`. Barlow Condensed e DM Sans são distribuídas sob SIL Open Font License, incluídas na pasta de fontes.
