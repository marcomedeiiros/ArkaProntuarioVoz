```bash
npm install                 
npm run install:all         
npm run setup:env           
```

```bash
npm run setup:env -- --anthropic-key --resend
npm run setup:env -- --admin
```

Primeira vez (cria as tabelas; o banco precisa estar rodando):

```bash
npm run db:local           
npm run db:migrate       
```

Dia a dia (um comando sobe banco, API e site juntos; feche com Ctrl+C):

```bash
npm run dev                 
```

Opcional:

```bash
npm run db:seed
npm run setup:env -- --anthropic-key
```
