'use strict';
// Structured provider failures. Messages are plain language and static:
// they never embed response bodies, so keys and other secrets cannot leak.
const messages={
  provider_not_configured:'No AI provider is configured on this server. You can continue in sample mode.',
  provider_timeout:'The AI service did not answer in time. You can retry or continue in sample mode.',
  provider_rate_limited:'The AI service is busy right now. You can retry in a moment or continue in sample mode.',
  provider_auth:'The AI service rejected the server’s credentials. Continue in sample mode and check the server configuration.',
  provider_bad_output:'The AI service returned an answer that could not be used. You can retry or continue in sample mode.',
  provider_content_filter:'The AI service declined to answer for this text. Rephrase your experience or continue in sample mode.',
  provider_error:'The AI service returned an error. You can retry or continue in sample mode.',
  provider_aborted:'The request was cancelled before the AI service answered.'
};
class ProviderError extends Error{
  constructor(code,message,{retryable=false,status=null,cause}={}){
    super(message||messages[code]||'The AI service failed.',cause===undefined?undefined:{cause});
    this.name='ProviderError';
    this.code=code;
    this.retryable=Boolean(retryable);
    this.status=status===undefined?null:status;
  }
  toJSON(){return {code:this.code,message:this.message,retryable:this.retryable};}
}
module.exports={ProviderError,messages};
