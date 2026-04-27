const { AUTH_CONTACT_TYPE } = require("../constants/auth.constants");

function toUserDto(user, decryptValue, maskContact) {
  const decryptedContact = decryptValue(user.encryptedContact);

  return {
    id: user.id,
    name: user.name,
    contactType: user.contactType,
    contactMasked: maskContact(user.contactType, decryptedContact),
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt
  };
}

function toRegisterResponse(contactType, pendingContact, verificationPreview) {
  return {
    message:
      contactType === AUTH_CONTACT_TYPE.EMAIL
        ? "Код подтверждения отправлен на email."
        : "Код подтверждения создан.",
    pendingContact,
    contactType,
    verificationPreview
  };
}

function toVerificationSuccessResponse(userDto) {
  return {
    message: "Контакт подтвержден. Вы вошли в аккаунт.",
    user: userDto
  };
}

function toLoginSuccessResponse(userDto) {
  return {
    message: "Вход выполнен.",
    user: userDto
  };
}

module.exports = {
  toUserDto,
  toRegisterResponse,
  toVerificationSuccessResponse,
  toLoginSuccessResponse
};
