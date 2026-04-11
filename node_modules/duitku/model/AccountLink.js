const getUserInfoAccountLink = require('../api/getUserInfoAccountLink.js')

class AccountLink{
    #credentialCode

    constructor(credentialCode){
        this.#credentialCode = credentialCode
    }

    get(){
        return {
            credentialCode: this.getCredentialCode()
        }
    }

    getCredentialCode(){
        return this.#credentialCode
    }

    setCredentialCode(credentialCode){
        this.#credentialCode = credentialCode
    }
}

class Shopee extends AccountLink{
    #promoId
    #useCoin

    constructor(credentialCode, useCoin = false, promoId = ""){
        super(credentialCode)
        this.#useCoin = useCoin
        this.#promoId = promoId
    }

    get(){
        return {
            credentialCode: this.getCredentialCode(),
            shopee: {
                promoId: this.#promoId,
                useCoin: this.#useCoin
            }
        }
    }

    getPromoId(){
        return this.#promoId
    }

    getUseCoin(){
        return this.#useCoin
    }

    setPromoId(promoId){
        this.#promoId = promoId
    }

    setUseCoin(boolean){
        this.#useCoin = boolean
    }
}

class Ovo extends AccountLink{
    #paymentDetails = []

    constructor(credentialCode, amount){
        super(credentialCode)
        this.#paymentDetails.push(new PaymentDetail(amount))
    }

    get(){
        return {
            credentialCode: this.getCredentialCode(),
            ovo: {
                paymentDetails: this.getPaymentDetails().get()
            }
        }
    }

    getPaymentDetails(){
        return this.#paymentDetails[0]
    }

    setAmount(amount){
        this.#paymentDetails[0].setAmount(amount)
    }
}

class PaymentDetail{
    #paymentType = "CASH"
    #amount = 0
    constructor(amount = 0){
        this.#amount = amount
    }

    get(){
        return [{
            paymentType: this.getPaymentType(),
            amount: this.getAmount()
        }]
    }

    getPaymentType(){
        return this.#paymentType
    }

    getAmount(){
        return this.#amount
    }

    setAmount(amount){
        this.#amount = amount
    }
}

module.exports = {
    Ovo, 
    Shopee
};