var see=7;//Comments assume see=7 even if this is not 7.
var height=4;
var minpieces=10-see;
var maxpieces=11-see;
var fs=require("fs");
var utils=require("tetris-fumen");
const {execSync}=require("node:child_process");
var fumen2setupboard=function(fumen){//This returns a board that can be used with sfinder setup.
  var board=utils.decoder.decode(fumen)[0].field.str().split("\n");
  board.pop();//Remove the empty row at the bottom
  board.reverse();//Currently the row order is top-down so we reverse it and make it bottom-up so that we can push/pop rows to/from the top
  while(board.length<height){//Add in missing blank rows to get the correct height
    board.push("__________");
  }
  board.reverse();//Now that the board has the correct height, we make the row order top-down again so that the fumen isn't upside-down
  //Turn board gray and background yellow
  board=board.map(row=>{
    row=row.split("");//Strings are immutable so we have to split them into a char array
    row=row.map(cell=>cell==="_"?"O":"X");//Anything that isn't blank will become gray and anything that is blank will become yellow
    return row;
  });
  return board;
};
var gappp=function(fumen,piece){//Get All Possible Piece Placements
  var board=fumen2setupboard(fumen);
  //Run sfinder to find all possible piece placements
  var positionlist=[];//sfinder requires at least one cell to be marked as "fill" instead of "margin", which is annoying, but possible to work around.
  for(var y=0;y<height;y++){
    for(var x=0;x<10;x++){
      if(board[y][x]==="O"){
        positionlist.push([x,y]);
      }
    }
  }
  var placements=[];
  for(var i=0;i<positionlist.length-3;i++){//We simply run sfinder once for each cell that could be marked as "fill" instead of "margin".
    //We can stop at positionlist.length-4 because then there will be less than 4 fillable cells, meaning that no piece could ever fit.
    var position=positionlist[i];
    var x=position[0];
    var y=position[1];
    board[y][x]="I";//Mark this cell as "fill"
    var fumen=utils.encoder.encode([{field:utils.Field.create(board.map(row=>row.join("")).join(""))}]);
    execSync("java -jar sfinder.jar setup -t "+fumen+" -f I -m O --format csv --kicks +jstris180 --drop 180 -p "+piece);//Run sfinder
    var data=fs.readFileSync("./output/setup.csv","utf-8")+"";
    data=data.split("\r\n");
    data.pop();//There is a japanese thing in the first line and the last line is blank
    data.reverse();
    data.pop();
    data=data.map(s=>s.substring(0,s.length-4));//Trim off the stuff that isn't actually part of the fumen
    placements=placements.concat(data);
    board[y][x]="_";//We can mark this as "off" instead of "margin" because anything that would show up later if this was marked as "margin" would have shown up when this was marked as "fill".
  }
  return placements;
};
var checksolve=function(fumen,queue,save,hidden,pieces){//Either says yes or gives a fail queue.
  var result;
  if(save==="X"){
    var data=execSync("java -jar sfinder.jar percent -t "+fumen+" -p "+queue+" -td 0 -fc 1 --kicks +jstris180 --drop 180")+"";    
    data=data.split("\r\n");
    var solvable=data[data.indexOf("# Output")+1].substring(10,17);
    if(solvable==="100.00%"){
      result="yes";
    }else{
      var failqueue=data[data.indexOf("Fail pattern (max. 1)")+1].split(", ").join("");
      failqueue=failqueue.substring(1,failqueue.length-1);
      result=failqueue;
    }
  }else{//For this case, just give it 6 or 7 pieces and put the rest in hidden I guess?
    var board=fumen2setupboard(fumen);
    var checkfumen=utils.encoder.encode([{field:utils.Field.create(board.map(row=>row.join("")).join(""))}]);
    //Use setup to get all possible solves
    var checkqueue=queue;
    var n=queue.length;
    var sliced;
    var dn;
    for(var i=0;i<hidden.length;i++){
      sliced=hidden[i];
      dn=sliced.length;
      if(n+dn>11-pieces){
        break;
      }else{
        n+=dn;
        checkqueue+="["+sliced+"]p"+dn;
        if(n===11-pieces){
          sliced="";
          break;
        }
      }
    }
    var guaranteed=0;
    checkqueue.split("").map(x=>guaranteed+=x===save);//Copies of the save piece in checkqueue
    //Multiple copies of the save piece in the sliced bag can guarantee some outside of checkqueue because of the pigeonhole principle, but this doesn't matter since we're looping based off of how many copies of the save piece we have access to. This can't happen in guideline, but I might as well cover it anyways.
    var extra=0;
    checkqueue.split("").map(x=>extra+=x===save);//Copies of the save pieces in sliced
    result="yes";
    for(var i=0;i<=extra;i++){
      var queues;
      if(sliced===""){
        queues=[""];
      }else{
        queues=execSync("java -jar sfinder.jar util seq -M pass -p ["+sliced+"]p"+(11-n-pieces)+" -n "+save+"="+i)+"";//Assume we have access to i extra copies of the save piece
        queues=queues.split("\r\n");
        queues.pop();
        if(!queues.length){
          continue;//No queues=Nothing to check
        }
      }
      queues=queues.map(x=>checkqueue+x).join("\n");
      fs.writeFileSync("./sfinder_patterns.txt",queues,"utf-8");
      execSync("java -jar sfinder.jar setup -t "+checkfumen+" -pp ./sfinder_patterns.txt --fill O --kicks +jstris180 --drop 180 --split yes --format csv");//All possible solves with queues with this many extra copies of the save piece
      var solves=fs.readFileSync("./output/setup.csv","utf-8").split("\r\n").slice(1);
      solves.pop();
      var goodsolves=[];
      solves.map(line=>{
        var parts=line.split(",");
        var solvefumen=parts[0];
        var savepiecesused=0;
        parts[1].split("").map(x=>savepiecesused+=x===save);
        if(savepiecesused<guaranteed+i){//This happenes when we save the piece we want
          goodsolves.push(solvefumen);//This lets us get all solves that save the piece we want
        }
      });
      if(goodsolves.length){
        fs.writeFileSync("./sfinder_solves.txt",goodsolves.join("\n"),"utf-8");
        var data=execSync("java -jar sfinder.jar cover -fp ./sfinder_solves.txt -pp ./sfinder_patterns.txt --kicks +jstris180 --drop 180")+"";//Now check if the solves have 100% cover
        data=data.split("\r\n");
        if(data[data.indexOf(">>>")+1].substring(6,14)!=="100.00 %"){
          result=(execSync("py failqueue.py")+"").split("\n")[0];
          break;
        }
      }else{
        result="all";
      }
    }
  }
  return result;
};
var makeseequeue=function(queue,hidden,n){
  var k=queue.length;
  var seequeue=queue;
  for(var i=0;i<hidden.length;i++){
    var bag=hidden[i];
    var dk=bag.length;
    if(!dk){
      break;
    }
    if(k+dk>n){
      dk=n-k;
    }
    seequeue+="["+bag+"]p"+dk;
  }
  return seequeue;
};
var issee7=function(fumen,queue,hidden,pieces,save){//Example: "v115@vhAAgh","SZOLZLJ",["ISOT"],0,"X"
  var header=". ".repeat(pieces);
  var result=false;
  console.log(header+"Checking "+fumen+" with queue="+queue+" (hidden="+hidden.join(";")+")");
  if(hidden[0]===""){//A piece from the next bag is now appearing in the queue
    hidden=hidden.slice(1);
  }
  if(pieces===minpieces){//Sometimes you can always solve directly from 3p without knowing the last piece in the queue
    if(queue.indexOf(save)===-1||hidden[0]===save){//X won't appear in the queue until someone hacks sfinder to do pentomino PCs
      console.log(header+" Running second "+minpieces+"p check");
      var solvable=checksolve(fumen,queue,"X");
      if(solvable==="yes"){
        console.log(header+" 100% from "+minpieces+"p");
        result=true;
      }else{
        console.log(header+" Not 100% from "+minpieces+"p");
        console.log(header+" Fail queue: "+solvable);
      }
    }else{//Can't save T from 3p if queue contains T, unless you know that piece 11 is T
      console.log(header+" Queue contains "+save+" without guaranteeing another one as piece 11; skipping second "+minpieces+"p check");
    }
  }
  var n=queue.length;
  var nsave=0;//If we are guaranteed more than one copy of the save piece, we can place some copies of the save piece
  queue.split("").map(x=>nsave+=x===save);
  for(var i=0;i<hidden.length;i++){//Count guaranteed save piece copies
    var bag=hidden[i];
    var dn=bag.length;
    var dnsave=0;
    bag.split("").map(x=>dnsave+=x===save);
    if(n+dn>11){
      nsave+=Math.max(0,dnsave-(n+dn-11));//Multiple copies of the save piece in the sliced bag can guarantee some outside of checkqueue because of the pigeonhole principle. This can't happen in guideline, but I might as well cover it anyways.
    }else{
      n+=dn;
      nsave+=dnsave;
    }
  }
  var canplacesave=nsave>1;
  var a=queue[0];
  var b=queue[1];
  var cdefg=queue.substring(2,see);
  if(!result&&(canplacesave||a!==save)){
    var placed_a=gappp(fumen,a);
    //A setup with queue ABCDEFG is 100% if and only if there exists a fixed piece placement for A where the resulting setup with queue BCDEFGH is 100% for all possible pieces H, or if there exists a fixed piece placement for B where the resulting setup with queue ACDEFGH is 100%.
    for(var i=0;i<placed_a.length;i++){//Try each piece placement for A
      var newfumen=placed_a[i];
      console.log(header+" Trying "+a+" placement at "+newfumen);
      //If it's not see-11 it's not see-7
      console.log(header+"  Running see11 check");
      var issee11=checksolve(newfumen,b+cdefg,save,hidden,pieces+1);
      if(issee11==="yes"){
        console.log(header+"  see11 check passed");
        if(pieces===maxpieces-1){//Placing the 4th piece here guarantees a solve for all possible revealed pieces.
          result=true;
          console.log(header+" "+a+" placement 100%");
          break;
        }else if(pieces===minpieces-1){//Check if the 3p is 100% before trying each possible revealed piece
          if(queue.indexOf(save)===-1){
            console.log(header+"  Running first "+minpieces+"p check");
            var queue3p=makeseequeue(b+cdefg,hidden,10-pieces);
            var check3p=checksolve(newfumen,queue3p,"X");
            if(check3p==="yes"){
              result=true;
              console.log(header+"  100% from "+minpieces+"p");
              console.log(header+" "+a+" placement 100%");
              break;
            }else{
              console.log(header+"  Not 100% from "+minpieces+"p");
              console.log(header+"  Fail queue: "+check3p);
            }
          }else{//Can't save T from 3p if queue contains T; "immediately after" argument doesn't apply since we cannot ever say for sure what piece 11 is if we don't know piece 10.
            console.log(header+" Queue contains "+save+"; skipping first "+minpieces+"p check");
          }
        }
      }else{
        console.log(header+"  see11 check failed");
        console.log(header+" "+a+" placement not 100%");
        console.log(header+" Fail queue: "+issee11);
        continue;//No need to try each queue if it's not 100% see-11
      }
      var guaranteed=true;
      var leftovers=hidden[0];
      for(var j=0;j<leftovers.length;j++){//Check each possible piece H
        var h=leftovers[j];
        var newleftovers=leftovers.substring(0,j)+leftovers.substring(j+1,leftovers.length);
        var newhidden=hidden.slice();
        newhidden[0]=newleftovers;
        if(!issee7(newfumen,b+cdefg+h,newhidden,pieces+1,save)){//This piece placement won't work so let's stop checking queues
          guaranteed=false;
          console.log(header+" "+a+" placement not 100%");
          break;
        }
      }
      if(guaranteed){//This piece placement will work so let's stop checking placements
        result=true;
        console.log(header+" "+a+" placement 100%");
        break;
      }
    }
  }
  if(!result&&a!==b&&(canplacesave||b!==save)){//There is no point in checking more piece placements if we already know an earlier piece placement works. There is also no point in checking piece placements for B if A and B are the same.
    var placed_b=gappp(fumen,b,pieces);
    for(var i=0;i<placed_b.length;i++){//Try each piece placement for B
      var newfumen=placed_b[i];
      console.log(header+" Trying "+b+" placement at "+newfumen);
      //If it's not see-11 it's not see-7
      console.log(header+"  Running see11 check");
      var issee11=checksolve(newfumen,a+cdefg,save,hidden,pieces+1);
      if(issee11==="yes"){
        console.log(header+"  see11 check passed");
        if(pieces===maxpieces-1){//Placing the 4th piece here guarantees a solve for all possible revealed pieces.
          result=true;
          console.log(header+" "+b+" placement 100%");
          break;
        }else if(pieces===minpieces-1){//Check if the 3p is 100% before trying each possible revealed piece
          if(queue.indexOf(save)===-1){
            console.log(header+"  Running first "+minpieces+"p check");
            var queue3p=makeseequeue(a+cdefg,hidden,10-pieces);
            var check3p=checksolve(newfumen,queue3p,"X");
            if(check3p==="yes"){
              result=true;
              console.log(header+"  100% from "+minpieces+"p");
              console.log(header+" "+b+" placement 100%");
              break;
            }else{
              console.log(header+"  Not 100% from "+minpieces+"p");
              console.log(header+"  Fail queue: "+check3p);
            }
          }else{//Can't save T from 3p if queue contains T; "immediately after" argument doesn't apply since we cannot ever say for sure what piece 11 is if we don't know piece 10.
            console.log(header+" Queue contains "+save+"; skipping first "+minpieces+"p check");
          }
        }
      }else{
        console.log(header+"  see11 check failed");
        console.log(header+" "+b+" placement not 100%");
        console.log(header+" Fail queue: "+issee11);
        continue;//No need to try each queue if it's not 100% see-11
      }
      var guaranteed=true;
      var leftovers=hidden[0];
      for(var j=0;j<leftovers.length;j++){//Check each possible piece H
        var h=leftovers[j];
        var newleftovers=leftovers.substring(0,j)+leftovers.substring(j+1,leftovers.length);
        var newhidden=hidden.slice();
        newhidden[0]=newleftovers;
        if(!issee7(newfumen,a+cdefg+h,newhidden,pieces+1,save)){//This piece placement won't work so let's stop checking queues
          guaranteed=false;
          console.log(header+" "+b+" placement not 100%");
          break;
        }
      }
      if(guaranteed){//This piece placement will work so let's stop checking placements
        result=true;
        console.log(header+" "+b+" placement 100%");
        break;
      }
    }
  }
  return result;
};
var blank="v115@vhAAgh";
//issee7("https://harddrop.com/fumen/?v115@GhA8HeD8DeF8CeE8JeAgH","ZLJISOT","",4);
//issee7(blank,"SZOLZLJ",["ISOT"],0,"X");
//issee7("v115@bhzhPeAgH","ITLJSOZ",["IJLOSTZ"],0,"X");
//issee7(blank,"JTLOIZS","IJLOSTZ",0);
//issee7(blank,"IITLJSO","Z",0);
//issee7("http://fumen.zui.jp/?v115@GhwhIewhRpCeR4BewhRpBeR4CewhJeAgWDAPddBA","LTJOZSZ","IJLST",3);
//issee7(blank,"OIJZTLO","S",0);
//issee7("https://harddrop.com/fumen/?v115@GhwhIewhRpGewhRpGewhJeAgH","JZTLOSO","IJLSTZ",2);
//issee7(blank,"ZLILJSZ","OT",0);
//issee7(blank,"SZTOLIJ","SZ",0);
//issee7(blank,"ITOJLSI","Z",0);
//issee7(blank,"ITIJZOS","L",0);
//issee7(blank,"IITLJOS","Z",0);
issee7(blank,"IJOTTJI",["LOSZ"],0,"T");