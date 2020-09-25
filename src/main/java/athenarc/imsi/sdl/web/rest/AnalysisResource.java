package athenarc.imsi.sdl.web.rest;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import javax.validation.Valid;

import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import athenarc.imsi.sdl.service.AnalysisService;
import athenarc.imsi.sdl.service.util.FileUtil;
import athenarc.imsi.sdl.service.util.RandomUtil;
import athenarc.imsi.sdl.web.rest.vm.QueryConfigVM;

/**
 * RankingResource controller
 */
@RestController
@RequestMapping("/api/analysis")
public class AnalysisResource {

    private final Logger log = LoggerFactory.getLogger(AnalysisResource.class);

    @Autowired
    private final AnalysisService analysisService = new AnalysisService();

    /**
     * POST submit
     */
    @PostMapping("/submit")
    public Document submit(@Valid @RequestBody QueryConfigVM config) {
        String id = UUID.randomUUID().toString();
        log.debug("Analysis task submitted with id: " + id);

        ArrayList<String> analyses = config.getAnalysis();
        if (analyses.contains("Ranking") && analyses.contains("Community Detection")) {
            analyses.add("Ranking - Community Detection");
            analyses.add("Community Detection - Ranking");
            config.setAnalysis(analyses);
        }

        try {

            // run async method from service
            analysisService.submit(
                id,
                config.getAnalysis(),
                config.getMetapath(),
                config.getJoinpath(),
                config.getConstraints(),
                config.getJoinK(),
                config.getSearchK(),
                config.getT(),
                config.getJoinW(),
                config.getSearchW(),
                config.getMinValues(),
                config.getTargetId(),
                config.getFolder(),
                config.getSelectField(),
                config.getEdgesThreshold(),
                config.getPrAlpha(),
                config.getPrTol(),
                config.getJoinMinValues(),
                config.getSearchMinValues()
            );

        } catch (java.io.IOException | InterruptedException e) {
            throw new RuntimeException("Error running ranking task: " + id);
        }
        return new Document("id", id).append("analysis", config.getAnalysis());
    }

    @GetMapping("/status")
    public Document status(String id) {
        log.debug("analysis/status : {}", id);

        Document response = new Document();
        response.append("id", id);

        try {
            // parse config file
            String conf = FileUtil.readJsonFile(FileUtil.getConfFile(id));
            Document config = Document.parse(conf);
            ArrayList<String> analyses = (ArrayList<String>) config.get("analyses");

            // parse log file
            String logfile = FileUtil.getLogfile(id);
            Document logInfo = FileUtil.parseLogfile(logfile);
            String lastLine = (String) logInfo.get("lastLine");

            ArrayList<String> completedStages = (ArrayList<String>) logInfo.get("completedStages");

            // determine analyses that have been completed
            Document completed = new Document();
            for (String analysis : analyses) {
                completed.append(analysis, completedStages.contains(analysis));
            }
            response.append("completed", completed);

            // form description of analysis
            String description = RandomUtil.getAnalysisDescription(config);
            response.append("description", description);

            Document analysesParameters = null;
            analysesParameters = FileUtil.getAnalysesParameters(config);

            String[] tokens = lastLine.split("\t");

            if (tokens[0].equals("Exit Code") && tokens[1].equals("0")) {
                analysesParameters.append("status", "COMPLETE");
            } else {
                analysesParameters.append("status", "PENDING");
            }
            log.debug(analysesParameters.toString());
            response.append("analysesParameters", analysesParameters);

            if (tokens[0].equals("Exit Code") && !tokens[1].equals("0")) {

                // set all analyses as completed, in order to stop loading on frontend
                Document comp = new Document();
                for (String analysis : analyses) {
                    completed.append(analysis, true);
                }
                response.append("completed", comp);
                if (tokens[1].equals("100")) {
                    response.append("description", "Warning: The produced HIN view does not contain any entities; please try again with more loose constrains.");
                } else if (tokens[1].equals("200")) {
                    response.append("description", "Warning: Due to limited resources the analysis was aborted as a large HIN view was created; please try again with more strict constraints.");
                } else {
                    throw new RuntimeException("Error in analysis task: " + id);
                }
            } else if (tokens.length == 3) {
                response.append("stage", tokens[0])
                    .append("step", tokens[2])
                    .append("progress", analysisService.getProgress(analyses, (Integer) logInfo.get("stageNum"), Integer.parseInt(tokens[1])));

                // in case logfile is still empty
            } else {
                response.append("stage", "HIN Transformation")
                    .append("step", "Initializing")
                    .append("progress", 0);
            }

        } catch (IOException e) {
            throw new RuntimeException("Error reading status from logfile");
        }
        return response;

    }

    /**
     * GET status
     */
    @GetMapping("/get")
    public Document get(String id, String analysis, Integer page) {
        log.debug("analysis/get : {}", id, page);

        String logfile = FileUtil.getLogfile(id);
        try {
            Document logInfo = FileUtil.parseLogfile(logfile);
            String lastLine = (String) logInfo.get("lastLine");

            // throw error if analaysis was aborted with an error code
            int index = lastLine.indexOf("Exit Code");
            Document response = new Document();
            if (index >= 0) {
                int exitCode = Integer.parseInt(lastLine.split("\t")[1]);

                // error occurred in ranking script
                if (exitCode != 0) {
                    throw new RuntimeException("Error in analysis task: " + id);
                }
            }

            String resultsFile = FileUtil.getOutputFile(id, analysis);

            try {
                Document meta = new Document();
                List<Document> docs = analysisService.getResults(resultsFile, page, meta);
                if (analysis.contains("Community")) {
                    String communityDetailsFile = FileUtil.getCommunityDetailsFile(id);
                    Document communityCounts = analysisService.getCommunityCounts(communityDetailsFile, docs);
                    meta.append("community_counts", communityCounts);
                }

                response.append("id", id)
                    .append("analysis", analysis)
                    .append("_meta", meta)
                    .append("docs", docs);

            } catch (IOException e) {
                throw new RuntimeException("Error results from file");
            }

            return response;
        } catch (IOException e) {
            throw new RuntimeException("Error reading status from logfile");
        }
    }

    /**
     * GET analysis exists
     */
    @GetMapping("/exists")
    public Document exists(String id) {
        log.debug("analysis/exists : {}", id);

        Boolean exists = FileUtil.dirExists(id);
        try {
            // parse config file
            String conf = FileUtil.readJsonFile(FileUtil.getConfFile(id));
            Document config = Document.parse(conf);
            ArrayList<String> analyses = (ArrayList<String>) config.get("analyses");
            return new Document().append("id", id).append("exists", exists).append("analysis", analyses);

        } catch (IOException e) {
            throw new RuntimeException("Error reading status from logfile");
        }

    }

}
