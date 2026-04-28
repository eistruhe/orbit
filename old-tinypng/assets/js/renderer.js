window.$ = window.jQuery = require('jquery');
window.Popper = require('popper.js')
require('bootstrap');

const settings = require('electron').remote.require('electron-settings');
const tinify = require("tinify");
const request = require('request');
const fs = require("fs");
const { clipboard } = require('electron')
const keyCodes = { V: 86, }
const maxLog = 8;
const batchSize = 2;
const alertType = { danger : 'alert-danger', warning : 'alert-warning', success : 'alert-success' }


let apikey = settings.get('api');
let overwrite = settings.get('overwrite');
let validAPI = false;
let count = 1;
let auth = '';
let compressionsThisMonth = 0;

function main() {
  if(!apikey)
  {
    getAPIKey(true);
  }
  else
  {
    tinify.key = apikey;
    validAPI = checkAPIKey();

    if(!validAPI) { getAPIKey(); }
  }

  if(overwrite) { $('.overwrite input').prop('checked', true); }

}

function setAPIKey(key)
{
  apikey = key;
  tinify.key = key;

  validAPI = checkAPIKey();

  if(validAPI)
  {
    settings.set('api', apikey);
    $('.modal').modal('hide');
    showAlert(alertType.success, 'API Key Saved.');
  }
}

function checkAPIKey()
{
  tinify.validate(function(err) {
    if (err)
    {
      showAlert(alertType.danger, 'Error : Invalid API Key');
      $('.api-input').val('');
      getAPIKey();

      return false;
    }
  });

  auth = new Buffer.from('api:' + apikey).toString('base64');

  return true;
}

function getAPIKey(firstrun)
{
  //$('.modal .btn').html('Save'); why did I add this???
  if(firstrun){ $('.modal .btn-cancel').hide(); }
  $('.modal').modal('show');
}

function showAlert(type, message)
{
    $('.alert').removeClass (function (index, className) {
      return (className.match (/(^|\s)alert-\S+/g) || []).join(' ');
    });
    $('.alert').addClass(type);
    $('.' + type).html(message).show().delay(4000).fadeOut();
}

function updateFileStatus(id, message)
{
    $('.file-' + id + ' .status').html(message);
}

function getFileSize(file)
{
    const stats = fs.statSync(file)
    const fileSizeInBytes = stats.size
    return fileSizeInBytes;
}

function getFileSizeKB(file, localFile = true)
{
    if(localFile) { file =  getFileSize(file); }
    file = (file / 1000);

    return file.toFixed(1);
}

async function tinyPNG(file, id)
{
  const options = {
      url: 'https://api.tinify.com/shrink',
      method: 'post',
      headers: {
          'Authorization': 'Basic ' + auth,
          'Accept': 'application/json',
          'User-Agent': 'tinyPNGApp'
      },
      body: fs.createReadStream(file)
  };

  return new Promise((resolve, reject) => {
      request(options, function(err, res, body) {
          let json = JSON.parse(body);

          if(json.hasOwnProperty('error'))
          {
             showAlert(alertType.danger, 'Error : ' + json.error);
             updateFileStatus(id, 'error.');
             reject(json.console.error());
          }
          else
          {
             $('.file-' + id + ' .size-before').addClass('strike');
             $('.file-' + id + ' .size-after').html(getFileSizeKB(json.output.size, false) + ' KB');

             if(!overwrite)
             {
               var regx = /^(.+[\\|\/])([a-z0-9|_|\-|!|\$|\s|\+]+)\.(png|jpg|jpeg)$/ig;
               var match = regx.exec(file);
               file = match[1] + match[2] + '-tinified.' + match[3];
             }

             request(json.output.url).pipe(fs.createWriteStream(file));
             updateFileStatus(id, 'done.');
             resolve();
          }
      });
  });

}

function processFiles(files)
{
  for (let f of files) {

      if(f.type == 'image/jpeg' || f.type == 'image/png') // check if valid file
      {
          if ((getFileSize(f.path) / 1000000.0) > 25) //check if valid size
          {
              showAlert(alertType.warning, 'Error : "' + f.name + '", max upload size is 5MB');
              return;
          }
          $('.file-process').prepend(
              '<div class="file file-' + count + '">' +
              '<div class="name">' + (f.name.length > 15 ? f.name.substring(0, 20) + '...' : f.name) + '</div>' +
              '<div class="status">processing...</div>' +
              '<div class="size size-after"></div>' +
              '<div class="size size-before">' + getFileSizeKB(f.path) + ' KB</div>' +
            '</div>'
          );

          tinyPNG(f.path, count);

          if($('.file').length > maxLog){ $('.file-process .file').last().remove(); }
      }
      else
      {
          showAlert(alertType.danger, 'Error : Only JPG or PNG files are supported.');
      }

      count++;

  }// end for 1
}

$('body').on('drop dragdrop', function(e){
    e.preventDefault();
    e.stopPropagation();

    if(!validAPI) { getAPIKey(); return;  }

    let files = (e.dataTransfer ? e.dataTransfer.files : e.originalEvent.dataTransfer.files)

    processFiles(files);
});

$('body').on('dragenter',function(e){ e.preventDefault(); });
$('body').on('dragleave',function(){ });
$('body').on('dragover',function(e){ e.preventDefault(); });

$('body').on('click', 'a.open', (event) => {
  event.preventDefault();
  let link = event.target.href;
  require("electron").shell.openExternal(link);
});

$('body').on('click', 'a.apikey', (event) => {
  event.preventDefault();
  getAPIKey();
});

$('.overwrite input').change(function(){
    if(this.checked) { settings.set('overwrite', 1); }
    else { settings.set('overwrite', 0); }

    overwrite = settings.get('overwrite');
});

$('.modal .btn-save').click(function(){
    if($('.api-input').val() == '')
    {
      showAlert(alertType.warning, 'Error : Please enter your API Key');
      return;
    }

    $(this).html('Validating...');
    setAPIKey($('.api-input').val());
});

$('.modal .btn-cancel').click(function(){
    $('.modal').modal('hide');
});

$(document).keydown(function(){
  let toReturn = true
	if(event.ctrlKey || event.metaKey){  // detect ctrl or cmd
		if(event.which == keyCodes.V){
			document.activeElement.value += clipboard.readText()
			document.activeElement.dispatchEvent(new Event('input'))
			toReturn = false
		}
	}

	return toReturn
 });

//start
main();
