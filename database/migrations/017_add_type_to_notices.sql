-- Adiciona tipo aos ofícios (bloqueio ou desbloqueio)
ALTER TABLE notices ADD COLUMN IF NOT EXISTS notice_type VARCHAR(20) DEFAULT 'block';
