# Documentos das Provas

Coloque aqui os documentos oficiais usados pela Biblioteca de Provas.

Convencao de nomes recomendada:

- `id-da-prova-prova.pdf`
- `id-da-prova-gabarito.pdf`
- `id-da-prova-edital.pdf`
- `id-da-prova-recurso.pdf`

Exemplo:

```text
cebraspe-tcu-2026-prova.pdf
cebraspe-tcu-2026-gabarito.pdf
```

Quando o gabarito estiver no mesmo documento da prova, vincule explicitamente o mesmo arquivo tambem como gabarito no manifesto. O sistema nao presume que o PDF da prova contem gabarito.

O campo `origem` em `dados/provas_manifest.json` aponta para a pagina oficial usada como fonte dos arquivos. Quando preenchido, a banca exibida no card vira link para essa origem.

Depois de adicionar arquivos, rode:

```bash
npm run provas:vincular
```
