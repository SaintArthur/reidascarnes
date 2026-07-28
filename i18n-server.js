// ─── i18n do back-end ──────────────────────────────────────────────────────
// As chaves de tradução são o próprio texto em português (idioma original do
// sistema), assim os call-sites não precisam inventar identificadores — só
// envolver a string existente em t(lang, '...').
// Uso: t(reqLang(req), 'Senha incorreta')

const EN = {
  // erros de autenticação / conta
  'Usuário não encontrado': 'User not found',
  'Senha incorreta': 'Incorrect password',
  'Token inválido': 'Invalid token',
  'Token não fornecido': 'Token not provided',
  'Acesso negado': 'Access denied',
  'Muitas tentativas de login. Tente novamente em alguns minutos.': 'Too many login attempts. Please try again in a few minutes.',
  'Nenhuma conta encontrada com esse e-mail': 'No account found with that email',
  'Email já cadastrado': 'Email already registered',
  'Nome e e-mail são obrigatórios': 'Name and email are required',
  'Campos obrigatórios faltando': 'Required fields missing',
  'Erro ao registrar': 'Error registering',
  'Telefone já cadastrado': 'Phone number already registered',
  'Telefone já cadastrado para outro usuário': 'Phone number already registered to another user',
  'E-mail já cadastrado para outro usuário': 'Email already registered to another user',
  'E-mail ou documento já cadastrado para outro usuário': 'Email or document already registered to another user',
  'Este CPF já está cadastrado em outra conta.': 'This CPF is already registered to another account.',
  'Erro ao atualizar perfil': 'Error updating profile',
  'Senha atual incorreta': 'Current password is incorrect',
  'A senha deve ter no mínimo 8 caracteres': 'Password must be at least 8 characters',
  'A nova senha deve ter no mínimo 8 caracteres': 'New password must be at least 8 characters',
  'Erro ao alterar senha': 'Error changing password',
  'Erro ao redefinir senha': 'Error resetting password',
  'Senha alterada com sucesso': 'Password changed successfully',
  'Senha redefinida com sucesso': 'Password reset successfully',

  // agendamentos
  'Serviço inválido': 'Invalid service',
  'Barbeiro inválido': 'Invalid barber',
  'Barbeiro não encontrado': 'Barber not found',
  'Horário já marcado': 'Time slot already booked',
  'Horário conflita com outro agendamento já marcado para este barbeiro': 'Time conflicts with another appointment already booked for this barber',
  'Não é possível agendar em uma data que já passou': 'Cannot book on a date that has already passed',
  'Não é possível agendar em um horário que já passou': 'Cannot book at a time that has already passed',
  'Agendamento não encontrado': 'Appointment not found',
  'Status inválido': 'Invalid status',
  'Este agendamento não pode mais ser cancelado': 'This appointment can no longer be cancelled',

  // clientes
  'Cliente não encontrado': 'Client not found',
  'Erro ao atualizar cliente': 'Error updating client',
  'Não é possível excluir um cliente com agendamentos registrados. Considere apenas editar os dados dele.': 'Cannot delete a client with registered appointments. Consider just editing their data instead.',
  'Cliente removido com sucesso': 'Client removed successfully',

  // avaliações
  'Avaliação não encontrada': 'Review not found',
  'Nota é obrigatória': 'Rating is required',
  'Só é possível avaliar atendimentos concluídos': 'Only completed appointments can be reviewed',
  'Este atendimento já foi avaliado': 'This appointment has already been reviewed',
  'Avaliação removida': 'Review removed',

  // barbeiros / escala / folgas
  'Dia da semana inválido': 'Invalid day of the week',
  'Schedule inválido': 'Invalid schedule',
  'Barbeiro removido com sucesso': 'Barber removed successfully',
  'Barbeiro não trabalha este dia': 'Barber does not work this day',
  'Erro ao atualizar horários': 'Error updating schedule',
  'Ausência não encontrada': 'Absence not found',
  'Já existe uma solicitação pendente para este dia': 'There is already a pending request for this day',
  'Apenas solicitações pendentes podem ser canceladas': 'Only pending requests can be cancelled',
  'Solicitação não encontrada': 'Request not found',
  'Solicitação cancelada': 'Request cancelled',
  'Bloqueio removido': 'Block removed',
  'Datas de início e fim são obrigatórias': 'Start and end dates are required',

  // notificações push
  'Endpoint obrigatório': 'Endpoint is required',
  'Assinatura de push inválida': 'Invalid push subscription',
  'Inscrito para notificações': 'Subscribed to notifications',
  'Inscrição removida': 'Subscription removed',
  'Removido da fila': 'Removed from waitlist',

  // cupons / configurações
  'Cupom inválido': 'Invalid coupon',
  'Configurações atualizadas': 'Settings updated',
  'Nada para atualizar': 'Nothing to update',
  'Backups são feitos automaticamente pelos snapshots do Aurora PostgreSQL. Não há mais um arquivo local para baixar.': 'Backups are handled automatically via Aurora PostgreSQL snapshots. There is no longer a local file to download.',

  // perfil
  'Perfil atualizado': 'Profile updated',

  // notificações (in-app + push) — títulos e templates com {placeholders}
  'Novo agendamento': 'New appointment',
  'Atualização do agendamento': 'Appointment update',
  'Cancelamento confirmado': 'Cancellation confirmed',
  'Cancelamento de agendamento': 'Appointment cancellation',
  'Solicitação de folga': 'Day-off request',
  'Folga aprovada': 'Day off approved',
  'Folga recusada': 'Day off declined',
  'Feliz aniversário!': 'Happy birthday!',
  'Seu horário começa em 1 hora!': 'Your appointment starts in 1 hour!',

  '{cliente} marcou {servico} em {data} às {hora}.': '{cliente} booked {servico} on {data} at {hora}.',
  'Seu agendamento de {servico} em {data} às {hora} foi confirmado pelo barbeiro.': 'Your {servico} appointment on {data} at {hora} was confirmed by the barber.',
  'Seu atendimento de {servico} foi concluído. Que tal avaliar o serviço?': 'Your {servico} appointment is complete. How about rating the service?',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado pelo barbeiro.': 'Your {servico} appointment on {data} at {hora} was cancelled by the barber.',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado. Taxa de cancelamento de {pct}% ({valor}) foi gerada e deve ser paga.': 'Your {servico} appointment on {data} at {hora} was cancelled. A {pct}% cancellation fee ({valor}) was generated and is due.',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado.': 'Your {servico} appointment on {data} at {hora} was cancelled.',
  '{cliente} cancelou o agendamento de {servico} em {data} às {hora}.': '{cliente} cancelled the {servico} appointment on {data} at {hora}.',
  '{cliente} cancelou o agendamento de {servico} em {data} às {hora}. Taxa de {valor} gerada (pendente).': '{cliente} cancelled the {servico} appointment on {data} at {hora}. A {valor} fee was generated (pending).',
  '{nome} solicitou folga em {dia} na escala semanal.': '{nome} requested a day off on {dia} in the weekly schedule.',
  'Sua solicitação de folga em {dia} foi aprovada.': 'Your day-off request for {dia} was approved.',
  'Sua solicitação de folga em {dia} foi recusada.': 'Your day-off request for {dia} was declined.',
  'Parabéns, {nome}! A equipe BarberPro deseja um ótimo dia. Que tal comemorar com um corte novo?': 'Congratulations, {nome}! The BarberPro team wishes you a great day. How about celebrating with a fresh haircut?',
  '{servico} com {barbeiro} às {hora}. Confirme sua presença no app.': '{servico} with {barbeiro} at {hora}. Confirm your attendance in the app.',

  // programa de indicação
  'Indicação recompensada!': 'Referral rewarded!',
  'Bem-vindo(a)!': 'Welcome!',
  'Alguém se cadastrou pelo seu link de indicação! Você ganhou: {bonus}.': 'Someone signed up using your referral link! You earned: {bonus}.',
  'Você ganhou {bonus} por se cadastrar através de uma indicação.': 'You earned {bonus} for signing up through a referral.',

  // logs do sistema
  'Tentativa de login inválida ({email})': 'Invalid login attempt ({email})',
  'Backup gerado por {usuario}': 'Backup generated by {usuario}',
  'Backup solicitado por {usuario}': 'Backup requested by {usuario}',
  'Log limpo por {usuario}': 'Log cleared by {usuario}',
  'Sistema iniciado': 'System started',
};

const ES = {
  'Usuário não encontrado': 'Usuario no encontrado',
  'Senha incorreta': 'Contraseña incorrecta',
  'Token inválido': 'Token inválido',
  'Token não fornecido': 'Token no proporcionado',
  'Acesso negado': 'Acceso denegado',
  'Muitas tentativas de login. Tente novamente em alguns minutos.': 'Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos.',
  'Nenhuma conta encontrada com esse e-mail': 'No se encontró ninguna cuenta con ese correo',
  'Email já cadastrado': 'Correo ya registrado',
  'Nome e e-mail são obrigatórios': 'Nombre y correo son obligatorios',
  'Campos obrigatórios faltando': 'Faltan campos obligatorios',
  'Erro ao registrar': 'Error al registrar',
  'Telefone já cadastrado': 'Teléfono ya registrado',
  'Telefone já cadastrado para outro usuário': 'Teléfono ya registrado para otro usuario',
  'E-mail já cadastrado para outro usuário': 'Correo ya registrado para otro usuario',
  'E-mail ou documento já cadastrado para outro usuário': 'Correo o documento ya registrado para otro usuario',
  'Este CPF já está cadastrado em outra conta.': 'Este CPF ya está registrado en otra cuenta.',
  'Erro ao atualizar perfil': 'Error al actualizar el perfil',
  'Senha atual incorreta': 'Contraseña actual incorrecta',
  'A senha deve ter no mínimo 8 caracteres': 'La contraseña debe tener al menos 8 caracteres',
  'A nova senha deve ter no mínimo 8 caracteres': 'La nueva contraseña debe tener al menos 8 caracteres',
  'Erro ao alterar senha': 'Error al cambiar la contraseña',
  'Erro ao redefinir senha': 'Error al restablecer la contraseña',
  'Senha alterada com sucesso': 'Contraseña cambiada con éxito',
  'Senha redefinida com sucesso': 'Contraseña restablecida con éxito',

  'Serviço inválido': 'Servicio inválido',
  'Barbeiro inválido': 'Barbero inválido',
  'Barbeiro não encontrado': 'Barbero no encontrado',
  'Horário já marcado': 'Horario ya reservado',
  'Horário conflita com outro agendamento já marcado para este barbeiro': 'El horario coincide con otra cita ya reservada para este barbero',
  'Não é possível agendar em uma data que já passou': 'No es posible agendar en una fecha que ya pasó',
  'Não é possível agendar em um horário que já passou': 'No es posible agendar en un horario que ya pasó',
  'Agendamento não encontrado': 'Cita no encontrada',
  'Status inválido': 'Estado inválido',
  'Este agendamento não pode mais ser cancelado': 'Esta cita ya no puede ser cancelada',

  'Cliente não encontrado': 'Cliente no encontrado',
  'Erro ao atualizar cliente': 'Error al actualizar el cliente',
  'Não é possível excluir um cliente com agendamentos registrados. Considere apenas editar os dados dele.': 'No es posible eliminar un cliente con citas registradas. Considera solo editar sus datos.',
  'Cliente removido com sucesso': 'Cliente eliminado con éxito',

  'Avaliação não encontrada': 'Reseña no encontrada',
  'Nota é obrigatória': 'La calificación es obligatoria',
  'Só é possível avaliar atendimentos concluídos': 'Solo es posible calificar atenciones concluidas',
  'Este atendimento já foi avaliado': 'Esta atención ya fue calificada',
  'Avaliação removida': 'Reseña eliminada',

  'Dia da semana inválido': 'Día de la semana inválido',
  'Schedule inválido': 'Horario inválido',
  'Barbeiro removido com sucesso': 'Barbero eliminado con éxito',
  'Barbeiro não trabalha este dia': 'El barbero no trabaja este día',
  'Erro ao atualizar horários': 'Error al actualizar los horarios',
  'Ausência não encontrada': 'Ausencia no encontrada',
  'Já existe uma solicitação pendente para este dia': 'Ya existe una solicitud pendiente para este día',
  'Apenas solicitações pendentes podem ser canceladas': 'Solo las solicitudes pendientes pueden ser canceladas',
  'Solicitação não encontrada': 'Solicitud no encontrada',
  'Solicitação cancelada': 'Solicitud cancelada',
  'Bloqueio removido': 'Bloqueo eliminado',
  'Datas de início e fim são obrigatórias': 'Las fechas de inicio y fin son obligatorias',

  'Endpoint obrigatório': 'Endpoint obligatorio',
  'Assinatura de push inválida': 'Suscripción push inválida',
  'Inscrito para notificações': 'Suscrito a notificaciones',
  'Inscrição removida': 'Suscripción eliminada',
  'Removido da fila': 'Eliminado de la fila',

  'Cupom inválido': 'Cupón inválido',
  'Configurações atualizadas': 'Configuración actualizada',
  'Nada para atualizar': 'Nada que actualizar',
  'Backups são feitos automaticamente pelos snapshots do Aurora PostgreSQL. Não há mais um arquivo local para baixar.': 'Las copias de seguridad se realizan automáticamente mediante snapshots de Aurora PostgreSQL. Ya no hay un archivo local para descargar.',

  'Perfil atualizado': 'Perfil actualizado',

  // notificações (in-app + push) — títulos e templates com {placeholders}
  'Novo agendamento': 'Nueva cita',
  'Atualização do agendamento': 'Actualización de la cita',
  'Cancelamento confirmado': 'Cancelación confirmada',
  'Cancelamento de agendamento': 'Cancelación de cita',
  'Solicitação de folga': 'Solicitud de día libre',
  'Folga aprovada': 'Día libre aprobado',
  'Folga recusada': 'Día libre rechazado',
  'Feliz aniversário!': '¡Feliz cumpleaños!',
  'Seu horário começa em 1 hora!': '¡Tu cita comienza en 1 hora!',

  '{cliente} marcou {servico} em {data} às {hora}.': '{cliente} reservó {servico} el {data} a las {hora}.',
  'Seu agendamento de {servico} em {data} às {hora} foi confirmado pelo barbeiro.': 'Tu cita de {servico} el {data} a las {hora} fue confirmada por el barbero.',
  'Seu atendimento de {servico} foi concluído. Que tal avaliar o serviço?': 'Tu atención de {servico} fue concluida. ¿Qué tal calificar el servicio?',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado pelo barbeiro.': 'Tu cita de {servico} el {data} a las {hora} fue cancelada por el barbero.',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado. Taxa de cancelamento de {pct}% ({valor}) foi gerada e deve ser paga.': 'Tu cita de {servico} el {data} a las {hora} fue cancelada. Se generó una tarifa de cancelación del {pct}% ({valor}) que debe pagarse.',
  'Seu agendamento de {servico} em {data} às {hora} foi cancelado.': 'Tu cita de {servico} el {data} a las {hora} fue cancelada.',
  '{cliente} cancelou o agendamento de {servico} em {data} às {hora}.': '{cliente} canceló la cita de {servico} el {data} a las {hora}.',
  '{cliente} cancelou o agendamento de {servico} em {data} às {hora}. Taxa de {valor} gerada (pendente).': '{cliente} canceló la cita de {servico} el {data} a las {hora}. Se generó una tarifa de {valor} (pendiente).',
  '{nome} solicitou folga em {dia} na escala semanal.': '{nome} solicitó un día libre el {dia} en el horario semanal.',
  'Sua solicitação de folga em {dia} foi aprovada.': 'Tu solicitud de día libre el {dia} fue aprobada.',
  'Sua solicitação de folga em {dia} foi recusada.': 'Tu solicitud de día libre el {dia} fue rechazada.',
  'Parabéns, {nome}! A equipe BarberPro deseja um ótimo dia. Que tal comemorar com um corte novo?': '¡Felicidades, {nome}! El equipo de BarberPro te desea un gran día. ¿Qué tal celebrar con un corte nuevo?',
  '{servico} com {barbeiro} às {hora}. Confirme sua presença no app.': '{servico} con {barbeiro} a las {hora}. Confirma tu asistencia en la app.',

  // programa de indicación
  'Indicação recompensada!': '¡Referido recompensado!',
  'Bem-vindo(a)!': '¡Bienvenido(a)!',
  'Alguém se cadastrou pelo seu link de indicação! Você ganhou: {bonus}.': '¡Alguien se registró con tu enlace de referido! Ganaste: {bonus}.',
  'Você ganhou {bonus} por se cadastrar através de uma indicação.': 'Ganaste {bonus} por registrarte a través de una recomendación.',

  // logs del sistema
  'Tentativa de login inválida ({email})': 'Intento de inicio de sesión inválido ({email})',
  'Backup gerado por {usuario}': 'Copia de seguridad generada por {usuario}',
  'Backup solicitado por {usuario}': 'Copia de seguridad solicitada por {usuario}',
  'Log limpo por {usuario}': 'Registro borrado por {usuario}',
  'Sistema iniciado': 'Sistema iniciado',
};

const DICTS = { en: EN, es: ES };
const SUPPORTED_LANGS = ['pt-BR', 'en', 'es'];

function t(lang, text, params) {
  let out = text;
  if (lang && lang !== 'pt-BR' && DICTS[lang] && DICTS[lang][text]) {
    out = DICTS[lang][text];
  }
  if (params) {
    // Replacer como função (não string) evita que padrões especiais do
    // String.replace (ex.: "$&") sejam interpretados dentro de um valor.
    Object.keys(params).forEach(k => { out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), () => params[k]); });
  }
  return out;
}

const WEEKDAYS = {
  'pt-BR': ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
};

function weekdayName(lang, dayIndex) {
  const list = WEEKDAYS[lang] || WEEKDAYS['pt-BR'];
  return list[dayIndex] ?? list[0];
}

function reqLang(req) {
  // O header reflete a escolha atual do usuário na UI (enviado a cada chamada);
  // o valor do JWT pode estar desatualizado até o próximo login, então o header
  // tem prioridade quando presente.
  const fromHeader = req.headers['x-lang'];
  const fromUser = req.user && req.user.language;
  const lang = fromHeader || fromUser || 'pt-BR';
  return SUPPORTED_LANGS.includes(lang) ? lang : 'pt-BR';
}

module.exports = { t, reqLang, SUPPORTED_LANGS, weekdayName };
