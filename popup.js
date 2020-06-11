document.addEventListener('DOMContentLoaded', function () {
	chrome.tabs.executeScript({
		code: "window.getSelection().toString();"
	}, function (selection) {
		if (selection[0]) {//If text is selected, show analysis button
			document.getElementById("button").style.display = "block";
			document.getElementById("help").style.display = "none";
		} else {//If text is not selected, show help text
			document.getElementById("help").style.display = "block";
			document.getElementById("button").style.display = "none";
		}
	});
	document.getElementById("instr").addEventListener("click", function () {
		chrome.tabs.create({ 'url': chrome.extension.getURL('instructions.html') })
	});

	//Hide and show elements to prepare popup for startup
	document.getElementById("ring").style.display = "none";
	document.getElementById("sug").style.display = "none";
	document.getElementById("help").style.display = "block";
	document.getElementById("button").style.display = "none";

	//When analysis button clicked, get selected text and call prediction function
	document.getElementById("button").addEventListener("click", function () {
		document.getElementById("ring").style.display = "block";
		document.getElementById("button").style.display = "none";
		chrome.tabs.executeScript(null, {
			code: "window.getSelection().toString();"
		},
			function (selection) {
				var text = selection[0]
				predict(text);
				chrome.tabs.executeScript(null, {
					code: "window.getSelection().removeAllRanges();"
				})
			});
	});
});

async function predict(text) {
	//Add spaces to start and end of text
	text = (" " + text + " ").toLowerCase();

	//Arrays of punctuation and stopwords to remove
	var punc = ["!", "\"", "#", "$", "%", "&", "(", ")", "*", "+", "-", ".", "/", ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~"];
	var stops = ["i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"];

	//Remove punctuation
	for (var i in punc) {
		text = text.toString().replace(i, " ");
	}

	//Remove stopwords
	for (var i in stops) {
		i2 = " " + i + " ";
		text = text.toString().replace(i2, " ");
	}

	//Convert string to array by splitting at spaces
	var words = text.split(" ");

	//Call function to get JSON word index, and parse
	var word_index = getWordIndex().toString();
	obj = JSON.parse(word_index);

	//Define array for sequences
	seqList = [];

	//Add tokens to list
	for (var i in words) {
		if (obj.hasOwnProperty(words[i])) {
			seqList.push(parseInt(obj[words[i]]));
		}
		else {
			seqList.push(0);
		}
	}

	//Pad or truncate vector as necessary, using 'pre' method
	maxLen = 500;
	if (seqList.length < maxLen) {
		//Define size for padding & pad array
		padding = maxLen - seqList.length;
		for (i = 0; i < padding; i++) {
			seqList.unshift(0);
		}
	}
	else if (seqList.length > maxLen) {
		//Define size for truncation & truncate array
		trunc = seqList.length - maxLen;
		for (i = 0; i < trunc; i++) {
			seqList.pop();
		}
	}

	//Convert array to 1d tensor
	const tensor = tf.stack([seqList]);

	//Load saved model and make prediction from tensor
	tf.loadLayersModel('model/model.json').then(function (model) {
		var results = Array.from(model.predict(tensor).dataSync());

		//Remove first item in resulting tensor, as it does not correspond to an email type
		results.shift();

		//Find item in tensor of largest value
		var iR = 0
		for (i = 0; i < 5; i++) {
			if (results[i] > results[iR]) {
				iR = i;
			}
		}

		//Get model certainty
		cert = (parseFloat(results[iR]) * 100).toFixed(2);

		//Create inverse map for label token
		lOb = JSON.parse("{\"1\": \"ham\", \"2\": \"unx\", \"3\": \"ext\", \"4\": \"imp\", \"5\": \"bec\"}");

		//Get predicted label from token of index of largest value in result tensor
		var label = lOb[iR + 1];

		//Display loading icon & hide text
		document.getElementById("ring").style.display = "none";
		document.getElementById("help").style.display = "block";

		//If email is ham, display tick and message
		if (iR == 0) {
			document.getElementById("logo").src = "images/tick.png";
			document.getElementById("help").innerHTML = "<h3>Legitimate Email - " + cert + "% certainty</h3><br>This email appears to be legitimate!";
		}
		//If email is phishing, display warning and advice
		else {
			document.getElementById("logo").src = "images/excl.png";
			//Create list elements to display
			var d1 = document.createElement("LI");
			var d2 = document.createElement("LI");
			var d3 = document.createElement("LI");
			var l1 = document.createElement("LI");
			var l2 = document.createElement("LI");
			var l3 = document.createElement("LI");

			if (label == "imp") {
				//Display type of email, model's certainty, and summary
				document.getElementById("help").innerHTML = "<h3>Impersonation Phishing - " + cert + "% certainty</h3><br>This email may be pretending to be from a real organisation - such as a bank or shop - in order to steal from you or place harmful software on your device.";

				//Display information about what user should do
				d1.innerText = "Contact the organisation through a trusted website, email address or phone number.";
				d2.innerText = "Check if the organisation has a specialist email address you can forward phishing emails to.";
				document.getElementById("do").append(d1, d2);

				//Display information about what user should look out for
				l1.innerText = "Generic greetings, such as \"Dear Customer\".";
				l2.innerText = "Unofficial \"From\" addresses.";
				document.getElementById("look").append(l1, l2);

			} else if (label == "bec") {
				document.getElementById("help").innerHTML = "<h3>CEO Fraud/Business Email Compromise - " + cert + "% Certainty</h3><br>This email may be trying to make you send money or information to an attacker by pretending to be a senior member of staff giving you important and secret instructions.";

				l1.innerText = "Requests not to talk to anyone else about the demand.";
				l2.innerText = "Asking for a bank transaction for a high amount of money to an unusual account number.";
				l3.innerText = "Requests to send gift voucher codes.";
				document.getElementById("look").append(l1, l2, l3);

				d1.innerText = "Contact the executive using a trusted email address or phone number.";
				d2.innerText = "Check the address that the email was sent from.";
				d3.innerText = "Review the message's structure and grammar.";
				document.getElementById("do").append(d1, d2, d3);

			} else if (label == "ext") {
				document.getElementById("help").innerHTML = "<h3>Extortion Phishing - " + cert + "% Certainty</h3><br>This email may be making threats to expose or harm you if you do not meet their demands.";

				l1.innerText = "Old password/phone number associated with your accounts.";
				l2.innerText = "Cryptocurrency wallet addresses.";
				l3.innerText = "Threats to embarrass or expose you.";
				document.getElementById("look").append(l1, l2, l3);

				d1.innerText = "Change your password on any potentially compromised accounts.";
				d2.innerText = "Alert the authorities, if there is a threat to public safety.";
				document.getElementById("do").append(d1, d2);

			} else if (label == "unx") {
				document.getElementById("help").innerHTML = "<h3>Unexpected Money/Winnings Scam - " + cert + "% Certainty</h3><br>This email may be attempting to steal your money or details by offering you money or prizes. You may be asked to pay a fee before you can receive the money, or to send your bank information to the sender.";

				l1.innerText = "Requests to pay money up-front.";
				l2.innerText = "Claims that you are in line to receive inheritance money, get a high-paying job, or meet a romantic partner.";
				l3.innerText = "Promises that you will be rewarded for helping the sender and that you will make back the money you pay them.";
				document.getElementById("look").append(l1, l2, l3);

				d1.innerText = "Use common sense and question why the sender has gotten in touch with you.";
				d2.innerText = "Search online for similar past scams.";
				d3.innerText = "Contact the police if you receive any threats.";
				document.getElementById("do").append(d1, d2, d3);
			}
			document.getElementById("sug").style.display = "block";
		}
	});
}
