const { exec } = require('child_process');
const fs = require('fs');

const displayTitles = {
  feat: 'Feature',
  fix: 'Bug Fix',
  chore: 'Chore',
};

exec(`git for-each-ref --sort=-creatordate --format="%(refname:short)" "refs/tags/v*"`, (err, tag, stderr) => {
  if (err) {
    console.error(`exec error: ${err}`);
    process.exit(1);
  }
  tag = tag.trim().split(/\s+/);

  const convertGroupedCommitsToString = (groupedCommits) => {
    let result = '';

    for (let type in groupedCommits) {
      const displayTitle = displayTitles[type] || capitalizeFirstLetter(type);
      result += `**${displayTitle} :**<br/>`;
      for (let commit of groupedCommits[type]) {
        result += `- ${commit.message}<br/>`;
      }
      result += '<br />';
    }

    return result;
  };

  const capitalizeFirstLetter = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const formatCommitMessage = (message, repository) => {
    return message.replace(/\(#(\d+)\)/, (_, prNumber) => {
      return `[#${prNumber}](https://github.com/${repository}/pull/${prNumber})`;
    });
  };

  const formattingCommit = (previousTag, lastTag, callback) => {
    exec(`git log ${previousTag}..${lastTag} --pretty=format:"%an: %s"`, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        callback(error);
        process.exit(1);
      }

      const commits = stdout.split('\n');
      const groupedCommits = commits.reduce((acc, commit) => {
        let [username, message] = commit.split(/: (.+)/);  // Split by the first colon
        message = message.replace(/\(([\w-]+)\)/, '');  // Remove the parenthetical type specifier

        const match = message.trim().match(/^(docs|chore|fix|feat)(?:\([\w]+\))?:\s.+$/);
        if (match) {
          const type = match[1];
          if (!acc[type]) {
            acc[type] = [];
          }
          acc[type].push({ message: formatCommitMessage(message.trim(), 'repo') + ' by ' + username });
        } else {
          if (!acc['others']) {
            acc['others'] = [];
          }
          acc['others'].push({ message: formatCommitMessage(message.trim(), 'repo') + ' by ' + username });
        }
        return acc;
      }, {});

      const formattedOutput = convertGroupedCommitsToString(groupedCommits);
      callback(formattedOutput)
      process.exit(0);
    })
  };

  const preRelease = (tags) => {
    if (tags[0].includes("-rc.")) {
      formattingCommit(tags[1], tags[0], (result) => {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}`);
      });
    } else {
      const latestRcTag = tags.find(tag => tag.includes("-rc."));
      formattingCommit(tags[0], latestRcTag, (result) => {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}`);
      });
    }
  };

  const release = (tags) => {
    const releaseTags = tags.filter(tag => !tag.includes("-rc."));

    formattingCommit(releaseTags[1], releaseTags[0], (result) => {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}`);
    });
  };

  if (process.env.INPUT_PRERELEASE) {
    preRelease(tag)
  } else {
    release(tag)
  };
});