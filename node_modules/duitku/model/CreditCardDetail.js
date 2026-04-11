class CreditCardDetail{
    #acquirer;
    #binWhitelist=[];
    constructor (acquirer = "", binWhitelist = []){
        this.#acquirer = acquirer,
        this.#binWhitelist = binWhitelist
    }

    get(){
        return {
            acquirer: this.getAcquirer(),
            binWhitelist: this.getBinWhiteList(),
        }
    }

    getAcquirer(){
        return this.#acquirer
    }

    getBinWhiteList(){
        return this.#binWhitelist
    }

    setAcquirer(value){
        this.#acquirer = value
    }

    addBinWhiteList(value){
        this.#binWhitelist.push(value)
    }

    removeBinWhiteList(value){
        const idx = this.#binWhitelist.findIndex(obj => obj == value)
        this.#binWhitelist.splice(idx, 1)
    }
}

module.exports = CreditCardDetail;