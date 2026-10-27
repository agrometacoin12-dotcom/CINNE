import { CommerceService } from './commerce.service';
function setup(credit=500) {
 const tx:any={ $queryRaw:jest.fn(async()=>[]),purchase:{findUnique:jest.fn(async()=>null),create:jest.fn(async({data})=>({id:'ticket',...data}))},entitlement:{findFirst:jest.fn(async()=>null),create:jest.fn()},appleSandboxCoinPurchase:{aggregate:jest.fn(async()=>({_sum:{coins:0}}))},korapayTestTopup:{aggregate:jest.fn(async()=>({_sum:{coins:credit}}))},appleSandboxCoinSpend:{aggregate:jest.fn(async()=>({_sum:{coins:0}})),create:jest.fn()}};
 const db:any={$transaction:(fn:any)=>fn(tx)};
 const wallet:any={apply:jest.fn()};
 const service=new CommerceService(db,{findRaw:async()=>({id:'movie',title:'Uploaded movie',status:'published',priceMinor:10000,currency:'NGN'})} as any,{} as any,{} as any,{} as any,{} as any,{} as any,{} as any,{get:()=>undefined} as any,wallet);
 return {service,tx,wallet};
}
it('uses confirmed Kora test credit for uploaded movies without creating monetary revenue',async()=>{
 const {service,tx,wallet}=setup(); await service.purchaseWithSandboxCoins('user','movie','key');
 expect(tx.korapayTestTopup.aggregate).toHaveBeenCalledWith({where:{userId:'user',status:'PAID'},_sum:{coins:true}});
 expect(tx.purchase.create.mock.calls[0][0].data).toMatchObject({amountMinor:0,provider:'MOCK',titleId:'movie'});
 expect(tx.appleSandboxCoinSpend.create.mock.calls[0][0].data.coins).toBe(100);
 expect(wallet.apply).not.toHaveBeenCalled();
});
it('does not grant a ticket without sufficient confirmed test coins',async()=>{const {service,tx}=setup(0);await expect(service.purchaseWithSandboxCoins('user','movie','key')).rejects.toThrow('Not enough');expect(tx.purchase.create).not.toHaveBeenCalled();});
