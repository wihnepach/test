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
    message: `Verification code sent to ${
      contactType === AUTH_CONTACT_TYPE.EMAIL ? "email" : "phone"
    }.`,
    pendingContact,
    contactType,
    verificationPreview
  };
}

function toVerificationSuccessResponse(userDto) {
  return {
    message: "Contact verified successfully. You are now logged in.",
    user: userDto
  };
}

function toLoginSuccessResponse(userDto) {
  return {
    message: "Login successful.",
    user: userDto
  };
}

module.exports = {
  toUserDto,
  toRegisterResponse,
  toVerificationSuccessResponse,
  toLoginSuccessResponse
};
