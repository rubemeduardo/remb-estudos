const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

// Tenta carregar variáveis de ambiente de um arquivo .env se existir
const envPath = path.join(__dirname, '..', '.env');
let pgConfig = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};
if (process.env.DATABASE_URL) pgConfig.connectionString = process.env.DATABASE_URL;

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length === 2) {
            const key = parts[0].trim();
            const val = parts[1].trim().replace(/(^"|"$)/g, ''); // remove aspas
            if (key === 'DB_USER') pgConfig.user = val;
            if (key === 'DB_HOST') pgConfig.host = val;
            if (key === 'DB_NAME') pgConfig.database = val;
            if (key === 'DB_PASS') pgConfig.password = val;
            if (key === 'DB_PORT') pgConfig.port = parseInt(val, 10);
            if (key === 'DB_SSL') pgConfig.ssl = val === 'true' ? { rejectUnauthorized: false } : undefined;
            if (key === 'DATABASE_URL') pgConfig.connectionString = val;
            if (!process.env[key]) process.env[key] = val;
        }
    });
}

const pool = new Pool(pgConfig);

// Helper para gerar fingerprint de texto
function generateFingerprint(text, type) {
    const cleanText = (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return crypto.createHash('sha256').update(cleanText + '_' + type).digest('hex');
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

async function runMigration() {
    console.log('Iniciando migração de dados...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Inserir administrador inicial somente por variável de ambiente
        if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
            console.log('Inserindo usuário administrador inicial...');
            await client.query(`
                INSERT INTO usuarios (id, nome, email, senha_hash, nivel, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (email) DO NOTHING
            `, [
                'u_admin_initial',
                process.env.ADMIN_NAME || 'Administrador',
                process.env.ADMIN_EMAIL.trim().toLowerCase(),
                hashPassword(process.env.ADMIN_PASSWORD),
                'CEO / PROPRIETÁRIO',
                'ATIVO'
            ]);
        } else {
            console.log('ADMIN_EMAIL/ADMIN_PASSWORD não definidos; administrador inicial não foi criado.');
        }

        // 2. Processar questoes_cespe_tratadas.json
        const cespePath = path.join(__dirname, '..', 'dados', 'questoes_cespe_tratadas.json');
        if (fs.existsSync(cespePath)) {
            console.log('Processando questoes_cespe_tratadas.json...');
            const rawCespe = fs.readFileSync(cespePath, 'utf8');
            const dataCespe = JSON.parse(rawCespe);
            
            // Garantir banca CEBRASPE
            const bancaRes = await client.query('INSERT INTO bancas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', ['CEBRASPE']);
            const bancaId = bancaRes.rows[0].id;

            let countCespe = 0;
            for (let q of dataCespe) {
                // Obter disciplina/assunto
                const disciplinaNome = q.disciplina || 'Outros';
                const assuntoNome = q.assunto || 'Geral';

                const discRes = await client.query('INSERT INTO disciplinas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', [disciplinaNome]);
                const discId = discRes.rows[0].id;

                const assRes = await client.query('INSERT INTO assuntos (nome, disciplina_id) VALUES ($1, $2) ON CONFLICT (nome, disciplina_id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', [assuntoNome, discId]);
                const assuntoId = assRes.rows[0].id;

                // Gerar fingerprint
                const fingerprint = generateFingerprint(q.enunciado || '', 'CERTO_ERRADO');

                // Inserir questão
                const qRes = await client.query(`
                    INSERT INTO questoes (id, tipo_questao, enunciado, justificativa, status, fingerprint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (fingerprint) DO UPDATE SET fingerprint = EXCLUDED.fingerprint RETURNING id
                `, [q.id, 'CERTO_ERRADO', q.enunciado, q.comentario_professor || q.justificativa, 'ATIVA', fingerprint]);
                
                const questionId = qRes.rows[0].id;

                // Associar assunto
                await client.query('INSERT INTO questao_assuntos (questao_id, assunto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [questionId, assuntoId]);

                // Inserir alternativas (Certo/Errado)
                if (q.alternativas && Array.isArray(q.alternativas)) {
                    for (let alt of q.alternativas) {
                        await client.query(`
                            INSERT INTO alternativas (questao_id, letra, texto, is_correta, ordem)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (questao_id, letra) DO NOTHING
                        `, [questionId, alt.letra, alt.texto, alt.correta || false, alt.letra === 'C' ? 1 : 2]);
                    }
                }

                // Mapear Proveniência/Fonte
                const provaNome = q.prova || 'CEBRASPE - Geral';
                const concursoNome = q.concurso || 'Geral';

                const concRes = await client.query('INSERT INTO concursos (nome, banca_id, ano) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id', [concursoNome, bancaId, q.ano || 2026]);
                let concursoId = concRes.rows[0]?.id;
                if (!concursoId) {
                    const existing = await client.query('SELECT id FROM concursos WHERE nome = $1 AND ano = $2', [concursoNome, q.ano || 2026]);
                    concursoId = existing.rows[0]?.id;
                }

                const provRes = await client.query('INSERT INTO provas (nome, concurso_id) VALUES ($1, $2) RETURNING id', [provaNome, concursoId]);
                const provaId = provRes.rows[0].id;

                await client.query(`
                    INSERT INTO questao_fontes (questao_id, tipo_fonte, prova_id, numero_original)
                    VALUES ($1, $2, $3, $4)
                `, [questionId, 'PROVA', provaId, q.numero || null]);

                countCespe++;
                if (countCespe % 500 === 0) console.log(`  Importadas ${countCespe} questões...`);
            }
            console.log(`Total de ${countCespe} questões CEBRASPE processadas.`);
        }

        // 3. Processar questoes_importadas_novas.json
        const novasPath = path.join(__dirname, '..', 'dados', 'questoes_importadas_novas.json');
        if (fs.existsSync(novasPath)) {
            console.log('Processando questoes_importadas_novas.json...');
            const rawNovas = fs.readFileSync(novasPath, 'utf8');
            const dataNovas = JSON.parse(rawNovas);

            let countNovas = 0;
            for (let q of dataNovas) {
                const disciplinaNome = q.disciplina || 'Outros';
                const assuntoNome = q.assunto || 'Geral';

                const discRes = await client.query('INSERT INTO disciplinas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', [disciplinaNome]);
                const discId = discRes.rows[0].id;

                const assRes = await client.query('INSERT INTO assuntos (nome, disciplina_id) VALUES ($1, $2) ON CONFLICT (nome, disciplina_id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', [assuntoNome, discId]);
                const assuntoId = assRes.rows[0].id;

                const fingerprint = generateFingerprint(q.enunciado || '', 'MULTIPLA_ESCOLHA');

                const qRes = await client.query(`
                    INSERT INTO questoes (id, tipo_questao, enunciado, justificativa, status, fingerprint)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (fingerprint) DO UPDATE SET fingerprint = EXCLUDED.fingerprint RETURNING id
                `, [q.id, 'MULTIPLA_ESCOLHA', q.enunciado, q.justificativa, 'ATIVA', fingerprint]);
                
                const questionId = qRes.rows[0].id;

                await client.query('INSERT INTO questao_assuntos (questao_id, assunto_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [questionId, assuntoId]);

                if (q.alternativas && Array.isArray(q.alternativas)) {
                    q.alternativas.forEach(async (alt, idx) => {
                        await client.query(`
                            INSERT INTO alternativas (questao_id, letra, texto, is_correta, ordem)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (questao_id, letra) DO NOTHING
                        `, [questionId, alt.letra || String.fromCharCode(65 + idx), alt.texto, alt.is_correta || false, idx + 1]);
                    });
                }

                // Fonte
                if (q.origem_questao) {
                    const bancaNome = q.origem_questao.banca || 'CEBRASPE';
                    const bancaRes = await client.query('INSERT INTO bancas (nome) VALUES ($1) ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome RETURNING id', [bancaNome]);
                    const bancaId = bancaRes.rows[0].id;

                    const concursoNome = q.origem_questao.concurso || 'Geral';
                    const concRes = await client.query('INSERT INTO concursos (nome, banca_id, ano) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id', [concursoNome, bancaId, q.origem_questao.ano || 2026]);
                    let concursoId = concRes.rows[0]?.id;
                    if (!concursoId) {
                        const existing = await client.query('SELECT id FROM concursos WHERE nome = $1 AND ano = $2', [concursoNome, q.origem_questao.ano || 2026]);
                        concursoId = existing.rows[0]?.id;
                    }

                    const provaNome = q.origem_questao.prova || 'Geral';
                    const provRes = await client.query('INSERT INTO provas (nome, concurso_id) VALUES ($1, $2) RETURNING id', [provaNome, concursoId]);
                    const provaId = provRes.rows[0].id;

                    await client.query(`
                        INSERT INTO questao_fontes (questao_id, tipo_fonte, prova_id, numero_original)
                        VALUES ($1, $2, $3, $4)
                    `, [questionId, 'PROVA', provaId, q.numero || null]);
                }

                countNovas++;
                if (countNovas % 500 === 0) console.log(`  Importadas ${countNovas} novas questões...`);
            }
            console.log(`Total de ${countNovas} novas questões processadas.`);
        }

        await client.query('COMMIT');
        console.log('Migração concluída com sucesso!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Erro durante a migração, transação abortada:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigration();
